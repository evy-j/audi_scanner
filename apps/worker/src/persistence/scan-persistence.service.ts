import { prisma } from "@audit-scanner/database";
import type {
  AnalyzerRunStatus,
  AnalyzerType,
  FindingConfidenceState,
  Prisma,
  VulnerabilityCategory
} from "@prisma/client";
import type {
  AggregatedVulnerability,
  NormalizedFindingEvidence,
  VulnerabilityNormalizationOutput
} from "@audit-scanner/scanner-core";
import { FindingScoringService } from "@audit-scanner/scanner-core";
import type { AnalyzerJobData, AnalyzerName } from "@audit-scanner/shared/queues/scan-jobs";
import { LocalScannerArtifactStore } from "../services/scan-execution/local-artifact-store.js";

export interface StartedAnalyzerRun {
  id: string;
  startedAt: Date;
}

export class ScanPersistenceService {
  constructor(
    private readonly artifactStore = new LocalScannerArtifactStore(),
    private readonly scoring = new FindingScoringService()
  ) {}

  async startAnalyzerRun(data: AnalyzerJobData): Promise<StartedAnalyzerRun> {
    const startedAt = new Date();
    const run = await prisma.analyzerRun.create({
      data: {
        scanId: data.scanId,
        organizationId: data.organizationId,
        analyzer: toAnalyzerType(data.analyzer),
        toolName: data.analyzer,
        status: "RUNNING",
        startedAt,
        traceId: data.traceId,
        correlationId: data.correlationId ?? null,
        metadata: {
          preparedArtifactKey: data.preparedArtifactKey,
          scannerImage: data.scannerImage,
          timeoutMs: data.timeoutMs
        }
      }
    });

    return { id: run.id, startedAt };
  }

  finalizeAnalyzerRun(input: {
    analyzerRunId: string;
    status: AnalyzerRunStatus;
    startedAt: Date;
    exitCode?: number | null | undefined;
    durationMs?: number | undefined;
    error?: string | undefined;
    rawArtifactKey?: string | undefined;
    rawArtifactChecksumSha256?: string | undefined;
    standardizedArtifactKey?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    return prisma.analyzerRun.update({
      where: { id: input.analyzerRunId },
      data: {
        status: input.status,
        finishedAt: new Date(),
        durationMs: input.durationMs ?? Math.max(0, Date.now() - input.startedAt.getTime()),
        exitCode: input.exitCode ?? null,
        error: input.error ?? null,
        rawArtifactKey: input.rawArtifactKey ?? null,
        rawArtifactChecksumSha256: input.rawArtifactChecksumSha256 ?? null,
        standardizedArtifactKey: input.standardizedArtifactKey ?? null,
        ...(input.metadata ? { metadata: toJsonObject(input.metadata) } : {})
      }
    });
  }

  async recordToolAvailability(input: {
    scanId: string;
    organizationId: string;
    toolName: string;
    toolVersion?: string | undefined;
    available: boolean;
    status: string;
    detectionCommand?: string | undefined;
    errorCategory?: string | undefined;
    error?: string | undefined;
    artifactKey?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    const scan = await prisma.scan.findFirst({
      where: { id: input.scanId, organizationId: input.organizationId, deletedAt: null },
      select: { projectId: true }
    });
    if (!scan) {
      return null;
    }

    return prisma.analyzerToolAvailability.upsert({
      where: {
        scanId_toolName: {
          scanId: input.scanId,
          toolName: input.toolName
        }
      },
      update: {
        organizationId: input.organizationId,
        projectId: scan.projectId,
        toolName: input.toolName,
        toolVersion: input.toolVersion ?? null,
        available: input.available,
        status: input.status,
        detectionCommand: input.detectionCommand ?? null,
        errorCategory: input.errorCategory ?? null,
        error: input.error ?? null,
        artifactKey: input.artifactKey ?? null,
        checkedAt: new Date(),
        metadata: toJsonObject(input.metadata ?? {})
      },
      create: {
        scanId: input.scanId,
        organizationId: input.organizationId,
        projectId: scan.projectId,
        toolName: input.toolName,
        toolVersion: input.toolVersion ?? null,
        available: input.available,
        status: input.status,
        detectionCommand: input.detectionCommand ?? null,
        errorCategory: input.errorCategory ?? null,
        error: input.error ?? null,
        artifactKey: input.artifactKey ?? null,
        metadata: toJsonObject(input.metadata ?? {})
      }
    });
  }

  async persistNormalizedVulnerabilities(output: VulnerabilityNormalizationOutput): Promise<number> {
    if (output.vulnerabilities.length === 0) {
      return 0;
    }

    const analyzerRuns = await prisma.analyzerRun.findMany({
      where: { scanId: output.scanId },
      orderBy: { startedAt: "desc" }
    });
    const analyzerRunByAnalyzer = new Map<AnalyzerType, (typeof analyzerRuns)[number]>();
    for (const run of analyzerRuns) {
      if (!analyzerRunByAnalyzer.has(run.analyzer)) {
        analyzerRunByAnalyzer.set(run.analyzer, run);
      }
    }
    const plans = await Promise.all(
      output.vulnerabilities.map(async (vulnerability) => ({
        vulnerability,
        scores: this.scoring.scoreAggregate(vulnerability),
        evidenceItems: await Promise.all(
          vulnerability.evidenceItems.map((item) =>
            this.enrichEvidenceItem(item, analyzerRunByAnalyzer.get(toAnalyzerType(item.analyzer)))
          )
        )
      }))
    );

    await prisma.$transaction(async (tx) => {
      for (const plan of plans) {
        const record = await tx.vulnerability.upsert({
          where: {
            scanId_fingerprint: {
              scanId: output.scanId,
              fingerprint: plan.vulnerability.fingerprint
            }
          },
          update: toVulnerabilityUpdate(plan.vulnerability, plan.scores),
          create: {
            scanId: output.scanId,
            status: "OPEN",
            ...toVulnerabilityCreate(plan.vulnerability, plan.scores)
          }
        });

        await tx.detectorMetadata.deleteMany({ where: { findingId: record.id } });
        await tx.findingEvidence.deleteMany({ where: { findingId: record.id } });
        await tx.sourceRange.deleteMany({ where: { findingId: record.id } });
        await tx.findingDecision.deleteMany({ where: { findingId: record.id } });

        for (const evidence of plan.evidenceItems) {
          const analyzerRun = analyzerRunByAnalyzer.get(toAnalyzerType(evidence.analyzer));
          const sourceRange = evidence.filePath
            ? await tx.sourceRange.create({
                data: {
                  findingId: record.id,
                  filePath: evidence.filePath,
                  startLine: evidence.startLine ?? null,
                  endLine: evidence.endLine ?? null,
                  startColumn: evidence.startColumn ?? null,
                  endColumn: evidence.endColumn ?? null,
                  snippet: evidence.snippet ?? null
                }
              })
            : null;
          const findingEvidence = await tx.findingEvidence.create({
            data: {
              findingId: record.id,
              analyzerRunId: analyzerRun?.id ?? null,
              sourceRangeId: sourceRange?.id ?? null,
              evidenceType: evidence.evidenceType,
              filePath: evidence.filePath ?? null,
              startLine: evidence.startLine ?? null,
              endLine: evidence.endLine ?? null,
              startColumn: evidence.startColumn ?? null,
              endColumn: evidence.endColumn ?? null,
              snippet: evidence.snippet ?? null,
              ruleId: evidence.ruleId ?? null,
              detectorName: evidence.detectorName ?? null,
              message: evidence.message,
              confidenceContribution: evidence.confidenceContribution,
              rawArtifactPath: evidence.rawArtifactPath,
              rawArtifactChecksum: evidence.rawArtifactChecksum ?? analyzerRun?.rawArtifactChecksumSha256 ?? null,
              metadata: toJsonObject({
                analyzer: evidence.analyzer,
                toolName: evidence.toolName,
                raw: evidence.raw ?? null
              })
            }
          });

          if (evidence.evidenceType === "ANALYZER") {
            await tx.analyzerEvidence.create({
              data: {
                findingEvidenceId: findingEvidence.id,
                analyzerRunId: analyzerRun?.id ?? null,
                analyzer: toAnalyzerType(evidence.analyzer),
                toolName: evidence.toolName,
                ruleId: evidence.ruleId ?? null,
                detectorName: evidence.detectorName ?? null,
                message: evidence.message,
                rawArtifactPath: evidence.rawArtifactPath,
                rawArtifactChecksum: evidence.rawArtifactChecksum ?? analyzerRun?.rawArtifactChecksumSha256 ?? null,
                metadata: toJsonObject({ raw: evidence.raw ?? null })
              }
            });
          }

          if (evidence.evidenceType === "TRACE" && evidence.raw !== undefined) {
            await tx.traceEvidence.create({
              data: {
                findingEvidenceId: findingEvidence.id,
                trace: toJsonValue(evidence.raw)
              }
            });
          }

          await tx.detectorMetadata.create({
            data: {
              findingId: record.id,
              findingEvidenceId: findingEvidence.id,
              analyzer: toAnalyzerType(evidence.analyzer),
              ruleId: evidence.ruleId ?? null,
              detectorName: evidence.detectorName ?? null,
              category: toPrismaCategory(plan.vulnerability.category),
              severity: plan.vulnerability.severity,
              confidence: plan.vulnerability.confidence,
              metadata: toJsonObject({ raw: evidence.raw ?? null })
            }
          });
        }

        await tx.findingDecision.create({
          data: {
            findingId: record.id,
            state: plan.scores.state,
            severityScore: plan.scores.severityScore,
            confidenceScore: plan.scores.confidenceScore,
            exploitabilityScore: plan.scores.exploitabilityScore,
            priorityScore: plan.scores.priorityScore,
            reason: plan.scores.reason,
            decidedBy: "deterministic-scoring/v1",
            metadata: toJsonObject({
              evidenceQuality: plan.scores.evidenceQuality,
              scoringVersion: "deterministic-scoring/v1"
            })
          }
        });
      }
    });

    return output.vulnerabilities.length;
  }

  private async enrichEvidenceItem(
    item: NormalizedFindingEvidence,
    analyzerRun: { rawArtifactChecksumSha256: string | null; metadata: Prisma.JsonValue } | undefined
  ): Promise<NormalizedFindingEvidence> {
    const snippet = item.snippet ?? (await this.tryReadSourceSnippet(item, analyzerRun));
    return {
      ...item,
      ...(snippet ? { snippet } : {}),
      ...(analyzerRun?.rawArtifactChecksumSha256
        ? { rawArtifactChecksum: analyzerRun.rawArtifactChecksumSha256 }
        : {})
    };
  }

  private async tryReadSourceSnippet(
    item: NormalizedFindingEvidence,
    analyzerRun: { metadata: Prisma.JsonValue } | undefined
  ): Promise<string | undefined> {
    if (!item.filePath || !item.startLine) {
      return undefined;
    }

    const preparedArtifactKey = getPreparedArtifactKey(analyzerRun?.metadata);
    if (!preparedArtifactKey) {
      return undefined;
    }

    const artifactKey = `${preparedArtifactKey}/${item.filePath.replace(/\\/gu, "/")}`;
    const source = await this.artifactStore.readTextByArtifactKey(artifactKey).catch(() => null);
    if (!source) {
      return undefined;
    }

    return extractSnippet(source, item.startLine, item.endLine ?? item.startLine);
  }
}

export function toAnalyzerType(analyzer: AnalyzerName | "aderyn"): AnalyzerType {
  switch (analyzer) {
    case "slither":
      return "SLITHER";
    case "mythril":
      return "MYTHRIL";
    case "semgrep":
      return "SEMGREP";
    case "aderyn":
      return "ADERYN";
    case "foundry":
      return "FOUNDRY";
  }
}

function toVulnerabilityCreate(
  vulnerability: AggregatedVulnerability,
  scores: {
    state: FindingConfidenceState;
    severityScore: number;
    confidenceScore: number;
    exploitabilityScore: number;
    priorityScore: number;
    evidenceQuality: number;
  }
): Omit<Prisma.VulnerabilityUncheckedCreateInput, "id" | "scanId" | "status" | "createdAt" | "updatedAt"> {
  const primary = vulnerability.primaryLocation;

  return {
    analyzer: toAnalyzerType(vulnerability.analyzers[0] ?? "semgrep"),
    externalRuleId: vulnerability.findingIds[0] ?? null,
    fingerprint: vulnerability.fingerprint,
    category: toPrismaCategory(vulnerability.category),
    title: vulnerability.title.slice(0, 240),
    description: vulnerability.description,
    severity: vulnerability.severity,
    confidence: vulnerability.confidence,
    confidenceState: scores.state,
    severityScore: scores.severityScore,
    confidenceScore: scores.confidenceScore,
    exploitabilityScore: scores.exploitabilityScore,
    priorityScore: scores.priorityScore,
    evidenceQuality: scores.evidenceQuality,
    filePath: primary.filePath ?? null,
    contractName: primary.contractName ?? null,
    functionName: primary.functionName ?? null,
    lineStart: primary.lineStart ?? null,
    lineEnd: primary.lineEnd ?? null,
    evidence: toJsonObject({
      evidence: vulnerability.evidence,
      locations: vulnerability.locations
    }),
    remediation: vulnerability.remediation ?? null,
    referenceUrls: vulnerability.references,
    metadata: toJsonObject({
      riskScore: vulnerability.riskScore,
      priorityScore: scores.priorityScore,
      analyzerCount: vulnerability.analyzerCount,
      analyzers: vulnerability.analyzers,
      findingIds: vulnerability.findingIds,
      cweIds: vulnerability.cweIds,
      swcIds: vulnerability.swcIds,
      owaspSmartContractTop10: vulnerability.owaspSmartContractTop10,
      owaspWebTop10: vulnerability.owaspWebTop10
    })
  };
}

function toVulnerabilityUpdate(
  vulnerability: AggregatedVulnerability,
  scores: {
    state: FindingConfidenceState;
    severityScore: number;
    confidenceScore: number;
    exploitabilityScore: number;
    priorityScore: number;
    evidenceQuality: number;
  }
): Prisma.VulnerabilityUncheckedUpdateInput {
  const { fingerprint: _fingerprint, ...data } = toVulnerabilityCreate(vulnerability, scores);
  return data;
}

function toPrismaCategory(category: AggregatedVulnerability["category"]): VulnerabilityCategory {
  switch (category) {
    case "REENTRANCY":
    case "INTEGER_OVERFLOW":
    case "TX_ORIGIN":
    case "ACCESS_CONTROL":
    case "DELEGATECALL":
    case "ORACLE_MANIPULATION":
    case "FLASH_LOAN":
    case "SELFDESTRUCT":
    case "UPGRADEABILITY":
    case "UNSAFE_EXTERNAL_CALL":
    case "HONEYPOT":
    case "RUG_PULL":
    case "SUSPICIOUS_OWNERSHIP":
    case "GAS_OPTIMIZATION":
    case "INSECURE_RANDOMNESS":
    case "DENIAL_OF_SERVICE":
    case "BUSINESS_LOGIC":
    case "OTHER":
      return category;
  }
}

function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getPreparedArtifactKey(metadata: Prisma.JsonValue | undefined): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  const value = (metadata as Record<string, unknown>).preparedArtifactKey;
  return typeof value === "string" ? value : undefined;
}

function extractSnippet(source: string, startLine: number, endLine: number): string {
  const lines = source.split(/\r?\n/u);
  const start = Math.max(1, startLine - 2);
  const end = Math.min(lines.length, endLine + 2);
  return lines.slice(start - 1, end).join("\n").slice(0, 8_000);
}
