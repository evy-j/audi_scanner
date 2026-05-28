import { prisma } from "@audit-scanner/database";
import type { AiValidationScope, Prisma } from "@prisma/client";
import { truncateAndRedact } from "./redaction.js";

export const AI_EVIDENCE_PACK_VERSION = "p4-ai-evidence-pack/v1";

const MAX_SNIPPET_CHARS = 4_000;
const MAX_MESSAGE_CHARS = 2_000;

export interface EvidenceLocation {
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  startColumn: number | null;
  endColumn: number | null;
}

export interface FindingEvidencePack {
  version: string;
  scope: "FINDING";
  scan: ScanContextPack;
  finding: {
    id: string;
    title: string;
    description: string | null;
    severity: string;
    confidence: string;
    confidenceState: string;
    status: string;
    analyzer: string;
    detectorRuleId: string | null;
    category: string;
    location: EvidenceLocation;
    scores: {
      severity: number;
      confidence: number;
      exploitability: number;
      priority: number;
      evidenceQuality: number;
    };
  };
  p1Evidence: Array<{
    id: string;
    evidenceType: string;
    ruleId: string | null;
    detectorName: string | null;
    message: string | null;
    location: EvidenceLocation;
    snippet: string | null;
    analyzerRunId: string | null;
    analyzerEvidenceId: string | null;
    rawArtifactPath: string | null;
    rawArtifactChecksum: string | null;
  }>;
  sourceRanges: Array<{ id: string; location: EvidenceLocation; snippet: string | null }>;
  detectorMetadata: Array<{
    id: string;
    analyzer: string;
    ruleId: string | null;
    detectorName: string | null;
    category: string | null;
    severity: string | null;
    confidence: string | null;
  }>;
  p2aReview: {
    status: string | null;
    suppressionRuleId: string | null;
    comments: Array<{ id: string; body: string; createdAt: string }>;
    events: Array<{ id: string; action: string; reason: string | null; createdAt: string }>;
  };
  p2bCodeLinks: Array<{
    id: string;
    linkType: string;
    extractionStatus: string;
    confidence: number;
    reason: string | null;
    location: EvidenceLocation;
    contractName: string | null;
    functionName: string | null;
    externalCallKind: string | null;
    storageLabel: string | null;
  }>;
  p3Context: BuildAndToolContextPack;
}

export interface ScanEvidencePack {
  version: string;
  scope: "SCAN_SUMMARY";
  scan: ScanContextPack;
  findings: Array<{
    id: string;
    title: string;
    severity: string;
    confidence: string;
    confidenceState: string;
    status: string;
    analyzer: string;
    location: EvidenceLocation;
    evidenceIds: string[];
    reviewStatus: string | null;
    codeLinkCount: number;
  }>;
  p3Context: BuildAndToolContextPack;
}

export interface ScanContextPack {
  id: string;
  organizationId: string;
  projectId: string | null;
  status: string;
  title: string | null;
  riskScore: number;
  analyzerRuns: Array<{
    id: string;
    analyzer: string;
    toolName: string;
    status: string;
    rawArtifactKey: string | null;
    rawArtifactChecksumSha256: string | null;
  }>;
  analysisIrRuns: Array<{
    id: string;
    extractionStatus: string;
    artifactKey: string | null;
    artifactChecksum: string | null;
    error: string | null;
  }>;
}

export interface BuildAndToolContextPack {
  buildProfiles: Array<{
    id: string;
    toolKind: string;
    toolName: string;
    toolVersion: string | null;
    projectRoot: string;
    configFile: string | null;
    confidence: number;
    detectionReason: string;
  }>;
  buildRuns: Array<{
    id: string;
    toolKind: string;
    command: string;
    status: string;
    exitCode: number | null;
    artifactPath: string | null;
    artifactChecksumSha256: string | null;
    errorCategory: string | null;
    error: string | null;
  }>;
  compilerArtifacts: Array<{
    id: string;
    artifactKind: string;
    artifactPath: string;
    checksumSha256: string;
    sizeBytes: number;
    compilerVersion: string | null;
    contractName: string | null;
    sourceFilePath: string | null;
  }>;
  testRuns: Array<{
    id: string;
    toolKind: string;
    command: string;
    status: string;
    exitCode: number | null;
    durationMs: number | null;
    results: Array<{
      id: string;
      suiteName: string | null;
      testName: string;
      status: string;
      durationMs: number | null;
      failureMessage: string | null;
      gasUsed: string | null;
    }>;
  }>;
  toolAvailability: Array<{
    id: string;
    toolName: string;
    toolVersion: string | null;
    available: boolean;
    status: string;
    errorCategory: string | null;
  }>;
}

export class AiEvidencePackBuilder {
  async buildFindingPack(
    findingId: string,
    organizationId: string
  ): Promise<FindingEvidencePack | null> {
    const finding = await prisma.vulnerability.findFirst({
      where: {
        id: findingId,
        deletedAt: null,
        scan: { organizationId, deletedAt: null }
      },
      include: {
        scan: {
          include: scanContextInclude()
        },
        evidenceItems: {
          orderBy: { createdAt: "asc" },
          include: {
            analyzerEvidence: true,
            analyzerRun: true,
            sourceRange: true
          }
        },
        sourceRanges: {
          orderBy: { createdAt: "asc" }
        },
        detectorMetadata: {
          orderBy: { createdAt: "asc" }
        },
        review: {
          include: {
            comments: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 20
            },
            events: {
              orderBy: { createdAt: "desc" },
              take: 20
            }
          }
        },
        codeLinks: {
          orderBy: { createdAt: "asc" },
          include: {
            contractSymbol: true,
            functionSymbol: true,
            externalCallSite: true,
            storageLayoutEntry: true
          }
        }
      }
    });

    if (!finding) {
      return null;
    }

    return {
      version: AI_EVIDENCE_PACK_VERSION,
      scope: "FINDING",
      scan: toScanContextPack(finding.scan),
      finding: {
        id: finding.id,
        title: finding.title,
        description: truncateAndRedact(finding.description, MAX_MESSAGE_CHARS),
        severity: finding.severity,
        confidence: finding.confidence,
        confidenceState: finding.confidenceState,
        status: finding.status,
        analyzer: finding.analyzer,
        detectorRuleId: finding.externalRuleId,
        category: finding.category,
        location: locationFrom(finding),
        scores: {
          severity: numberValue(finding.severityScore),
          confidence: numberValue(finding.confidenceScore),
          exploitability: numberValue(finding.exploitabilityScore),
          priority: numberValue(finding.priorityScore),
          evidenceQuality: numberValue(finding.evidenceQuality)
        }
      },
      p1Evidence: finding.evidenceItems.map((evidence) => ({
        id: evidence.id,
        evidenceType: evidence.evidenceType,
        ruleId: evidence.ruleId,
        detectorName: evidence.detectorName,
        message: truncateAndRedact(evidence.message, MAX_MESSAGE_CHARS),
        location: locationFrom(evidence),
        snippet: truncateAndRedact(evidence.snippet, MAX_SNIPPET_CHARS),
        analyzerRunId: evidence.analyzerRunId,
        analyzerEvidenceId: evidence.analyzerEvidence?.id ?? null,
        rawArtifactPath: evidence.rawArtifactPath,
        rawArtifactChecksum: evidence.rawArtifactChecksum
      })),
      sourceRanges: finding.sourceRanges.map((range) => ({
        id: range.id,
        location: locationFrom(range),
        snippet: truncateAndRedact(range.snippet, MAX_SNIPPET_CHARS)
      })),
      detectorMetadata: finding.detectorMetadata.map((metadata) => ({
        id: metadata.id,
        analyzer: metadata.analyzer,
        ruleId: metadata.ruleId,
        detectorName: metadata.detectorName,
        category: metadata.category,
        severity: metadata.severity,
        confidence: metadata.confidence
      })),
      p2aReview: {
        status: finding.review?.status ?? null,
        suppressionRuleId: finding.review?.suppressionRuleId ?? null,
        comments:
          finding.review?.comments.map((comment) => ({
            id: comment.id,
            body: truncateAndRedact(comment.body, MAX_MESSAGE_CHARS) ?? "",
            createdAt: comment.createdAt.toISOString()
          })) ?? [],
        events:
          finding.review?.events.map((event) => ({
            id: event.id,
            action: event.action,
            reason: truncateAndRedact(event.reason, MAX_MESSAGE_CHARS),
            createdAt: event.createdAt.toISOString()
          })) ?? []
      },
      p2bCodeLinks: finding.codeLinks.map((link) => ({
        id: link.id,
        linkType: link.linkType,
        extractionStatus: link.extractionStatus,
        confidence: numberValue(link.confidence),
        reason: truncateAndRedact(link.reason, MAX_MESSAGE_CHARS),
        location: locationFrom(link),
        contractName: link.contractSymbol?.fullyQualifiedName ?? link.contractSymbol?.name ?? null,
        functionName: link.functionSymbol?.canonicalName ?? link.functionSymbol?.name ?? null,
        externalCallKind: link.externalCallSite?.callKind ?? null,
        storageLabel: link.storageLayoutEntry?.label ?? null
      })),
      p3Context: toBuildAndToolContextPack(finding.scan)
    };
  }

  async buildScanSummaryPack(
    scanId: string,
    organizationId: string
  ): Promise<ScanEvidencePack | null> {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      include: {
        ...scanContextInclude(),
        vulnerabilities: {
          where: { deletedAt: null },
          orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
          take: 100,
          include: {
            evidenceItems: {
              orderBy: { createdAt: "asc" },
              take: 20,
              select: { id: true }
            },
            review: true,
            codeLinks: {
              select: { id: true }
            }
          }
        }
      }
    });

    if (!scan) {
      return null;
    }

    return {
      version: AI_EVIDENCE_PACK_VERSION,
      scope: "SCAN_SUMMARY",
      scan: toScanContextPack(scan),
      findings: scan.vulnerabilities.map((finding) => ({
        id: finding.id,
        title: finding.title,
        severity: finding.severity,
        confidence: finding.confidence,
        confidenceState: finding.confidenceState,
        status: finding.status,
        analyzer: finding.analyzer,
        location: locationFrom(finding),
        evidenceIds: finding.evidenceItems.map((evidence) => evidence.id),
        reviewStatus: finding.review?.status ?? null,
        codeLinkCount: finding.codeLinks.length
      })),
      p3Context: toBuildAndToolContextPack(scan)
    };
  }
}

function scanContextInclude() {
  return {
    analyzerRuns: {
      orderBy: { startedAt: "desc" },
      take: 20
    },
    analysisIrRuns: {
      orderBy: { createdAt: "desc" },
      take: 5
    },
    buildProfiles: {
      orderBy: { createdAt: "desc" },
      take: 3
    },
    buildRuns: {
      orderBy: { startedAt: "desc" },
      take: 10
    },
    compilerArtifacts: {
      orderBy: [{ createdAt: "desc" }, { artifactPath: "asc" }],
      take: 40
    },
    testRuns: {
      orderBy: { startedAt: "desc" },
      take: 10,
      include: {
        results: {
          orderBy: { createdAt: "asc" },
          take: 40
        }
      }
    },
    analyzerToolAvailability: {
      orderBy: [{ toolName: "asc" }, { checkedAt: "desc" }]
    }
  } satisfies Prisma.ScanInclude;
}

function toScanContextPack(scan: {
  id: string;
  organizationId: string;
  projectId: string | null;
  status: string;
  title: string | null;
  riskScore: unknown;
  analyzerRuns: Array<{
    id: string;
    analyzer: string;
    toolName: string;
    status: string;
    rawArtifactKey: string | null;
    rawArtifactChecksumSha256: string | null;
  }>;
  analysisIrRuns: Array<{
    id: string;
    extractionStatus: string;
    artifactKey: string | null;
    artifactChecksum: string | null;
    error: string | null;
  }>;
}): ScanContextPack {
  return {
    id: scan.id,
    organizationId: scan.organizationId,
    projectId: scan.projectId,
    status: scan.status,
    title: scan.title,
    riskScore: numberValue(scan.riskScore),
    analyzerRuns: scan.analyzerRuns.map((run) => ({
      id: run.id,
      analyzer: run.analyzer,
      toolName: run.toolName,
      status: run.status,
      rawArtifactKey: run.rawArtifactKey,
      rawArtifactChecksumSha256: run.rawArtifactChecksumSha256
    })),
    analysisIrRuns: scan.analysisIrRuns.map((run) => ({
      id: run.id,
      extractionStatus: run.extractionStatus,
      artifactKey: run.artifactKey,
      artifactChecksum: run.artifactChecksum,
      error: truncateAndRedact(run.error, MAX_MESSAGE_CHARS)
    }))
  };
}

function toBuildAndToolContextPack(scan: {
  buildProfiles: Array<{
    id: string;
    toolKind: string;
    toolName: string;
    toolVersion: string | null;
    projectRoot: string;
    configFile: string | null;
    confidence: unknown;
    detectionReason: string;
  }>;
  buildRuns: Array<{
    id: string;
    toolKind: string;
    command: string;
    status: string;
    exitCode: number | null;
    artifactPath: string | null;
    artifactChecksumSha256: string | null;
    errorCategory: string | null;
    error: string | null;
  }>;
  compilerArtifacts: Array<{
    id: string;
    artifactKind: string;
    artifactPath: string;
    checksumSha256: string;
    sizeBytes: number;
    compilerVersion: string | null;
    contractName: string | null;
    sourceFilePath: string | null;
  }>;
  testRuns: Array<{
    id: string;
    toolKind: string;
    command: string;
    status: string;
    exitCode: number | null;
    durationMs: number | null;
    results: Array<{
      id: string;
      suiteName: string | null;
      testName: string;
      status: string;
      durationMs: number | null;
      failureMessage: string | null;
      gasUsed: bigint | null;
    }>;
  }>;
  analyzerToolAvailability: Array<{
    id: string;
    toolName: string;
    toolVersion: string | null;
    available: boolean;
    status: string;
    errorCategory: string | null;
  }>;
}): BuildAndToolContextPack {
  return {
    buildProfiles: scan.buildProfiles.map((profile) => ({
      id: profile.id,
      toolKind: profile.toolKind,
      toolName: profile.toolName,
      toolVersion: profile.toolVersion,
      projectRoot: profile.projectRoot,
      configFile: profile.configFile,
      confidence: numberValue(profile.confidence),
      detectionReason: profile.detectionReason
    })),
    buildRuns: scan.buildRuns.map((run) => ({
      id: run.id,
      toolKind: run.toolKind,
      command: run.command,
      status: run.status,
      exitCode: run.exitCode,
      artifactPath: run.artifactPath,
      artifactChecksumSha256: run.artifactChecksumSha256,
      errorCategory: run.errorCategory,
      error: truncateAndRedact(run.error, MAX_MESSAGE_CHARS)
    })),
    compilerArtifacts: scan.compilerArtifacts.map((artifact) => ({
      id: artifact.id,
      artifactKind: artifact.artifactKind,
      artifactPath: artifact.artifactPath,
      checksumSha256: artifact.checksumSha256,
      sizeBytes: artifact.sizeBytes,
      compilerVersion: artifact.compilerVersion,
      contractName: artifact.contractName,
      sourceFilePath: artifact.sourceFilePath
    })),
    testRuns: scan.testRuns.map((run) => ({
      id: run.id,
      toolKind: run.toolKind,
      command: run.command,
      status: run.status,
      exitCode: run.exitCode,
      durationMs: run.durationMs,
      results: run.results.map((result) => ({
        id: result.id,
        suiteName: result.suiteName,
        testName: result.testName,
        status: result.status,
        durationMs: result.durationMs,
        failureMessage: truncateAndRedact(result.failureMessage, MAX_MESSAGE_CHARS),
        gasUsed: result.gasUsed === null ? null : result.gasUsed.toString()
      }))
    })),
    toolAvailability: scan.analyzerToolAvailability.map((tool) => ({
      id: tool.id,
      toolName: tool.toolName,
      toolVersion: tool.toolVersion,
      available: tool.available,
      status: tool.status,
      errorCategory: tool.errorCategory
    }))
  };
}

function locationFrom(input: {
  filePath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  startColumn?: number | null;
  endColumn?: number | null;
  lineStart?: number | null;
  lineEnd?: number | null;
}): EvidenceLocation {
  return {
    filePath: input.filePath ?? null,
    startLine: input.startLine ?? input.lineStart ?? null,
    endLine: input.endLine ?? input.lineEnd ?? null,
    startColumn: input.startColumn ?? null,
    endColumn: input.endColumn ?? null
  };
}

function numberValue(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function scopeToPrisma(scope: "FINDING" | "SCAN_SUMMARY"): AiValidationScope {
  return scope;
}
