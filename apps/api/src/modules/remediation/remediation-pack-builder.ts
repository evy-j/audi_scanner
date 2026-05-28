import { createHash } from "node:crypto";
import type { AiValidationDecision, Prisma } from "@prisma/client";
import { prisma } from "../../infra/prisma/prisma.js";
import { truncateAndRedact } from "./redaction.js";

export const REMEDIATION_PACK_VERSION = "p5-remediation-pack/v1";

const MAX_SNIPPET_CHARS = 4_000;
const MAX_MESSAGE_CHARS = 2_000;
const ELIGIBLE_REVIEW_STATUSES = new Set(["ACCEPTED", "NEEDS_REVIEW", "UNREVIEWED"]);
const DISQUALIFYING_AI_DECISIONS = new Set<AiValidationDecision>([
  "CONTRADICTED",
  "LIKELY_FALSE_POSITIVE"
]);

export interface RemediationEligibility {
  eligible: boolean;
  status: "ELIGIBLE" | "NOT_ELIGIBLE";
  reason: string | null;
  guidanceOnly: boolean;
}

export interface EvidenceLocation {
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  startColumn: number | null;
  endColumn: number | null;
}

export interface RemediationPack {
  version: string;
  scope: "FINDING_REMEDIATION";
  eligibility: RemediationEligibility;
  diffSuggestionsAllowed: boolean;
  limitations: string[];
  scan: {
    id: string;
    organizationId: string;
    projectId: string | null;
    status: string;
    title: string | null;
    riskScore: number;
  };
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
    remediationText: string | null;
  };
  p1Evidence: Array<{
    id: string;
    evidenceType: string;
    ruleId: string | null;
    detectorName: string | null;
    message: string | null;
    location: EvidenceLocation;
    snippet: string | null;
    rawArtifactPath: string | null;
    rawArtifactChecksum: string | null;
  }>;
  eligibleSourceLocations: Array<{
    filePath: string;
    startLine: number;
    endLine: number;
    startColumn: number | null;
    endColumn: number | null;
    snippet: string | null;
    source: string;
  }>;
  p2aReview: {
    status: string;
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
    externalCallTarget: string | null;
    storageLabel: string | null;
    storageSlot: string | null;
  }>;
  p3Context: {
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
  };
  p4AiValidation: {
    latestDecision: string | null;
    status: string | null;
    reasoningSummary: string | null;
    contradictionNotes: string | null;
    humanReviewerChecklist: string[];
  };
}

export interface BuiltRemediationPack {
  pack: RemediationPack;
  checksum: string;
}

export class RemediationPackBuilder {
  async buildFindingPack(
    findingId: string,
    organizationId: string
  ): Promise<BuiltRemediationPack | null> {
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
        },
        aiFindingValidations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            aiValidationRun: true
          }
        }
      }
    });

    if (!finding) {
      return null;
    }

    const latestValidation = finding.aiFindingValidations[0] ?? null;
    const reviewStatus = finding.review?.status ?? "UNREVIEWED";
    const sourceLocations = eligibleSourceLocations(finding);
    const eligibility = assessEligibility({
      findingStatus: finding.status,
      reviewStatus,
      evidenceCount: finding.evidenceItems.length,
      latestDecision: latestValidation?.decision ?? null,
      hasExactSourceRange: sourceLocations.length > 0
    });
    const limitations = buildLimitations(finding.evidenceItems.length, sourceLocations.length, latestValidation?.decision ?? null);
    const pack: RemediationPack = {
      version: REMEDIATION_PACK_VERSION,
      scope: "FINDING_REMEDIATION",
      eligibility,
      diffSuggestionsAllowed: eligibility.eligible && sourceLocations.length > 0,
      limitations,
      scan: {
        id: finding.scan.id,
        organizationId: finding.scan.organizationId,
        projectId: finding.scan.projectId,
        status: finding.scan.status,
        title: finding.scan.title,
        riskScore: numberValue(finding.scan.riskScore)
      },
      finding: {
        id: finding.id,
        title: truncateAndRedact(finding.title, 240) ?? finding.title,
        description: truncateAndRedact(finding.description, MAX_MESSAGE_CHARS),
        severity: finding.severity,
        confidence: finding.confidence,
        confidenceState: finding.confidenceState,
        status: finding.status,
        analyzer: finding.analyzer,
        detectorRuleId: finding.externalRuleId,
        category: finding.category,
        location: locationFrom(finding),
        remediationText: truncateAndRedact(finding.remediation, MAX_MESSAGE_CHARS)
      },
      p1Evidence: finding.evidenceItems.map((evidence) => ({
        id: evidence.id,
        evidenceType: evidence.evidenceType,
        ruleId: evidence.ruleId,
        detectorName: evidence.detectorName,
        message: truncateAndRedact(evidence.message, MAX_MESSAGE_CHARS),
        location: locationFrom(evidence),
        snippet: truncateAndRedact(evidence.snippet, MAX_SNIPPET_CHARS),
        rawArtifactPath: evidence.rawArtifactPath,
        rawArtifactChecksum: evidence.rawArtifactChecksum
      })),
      eligibleSourceLocations: sourceLocations,
      p2aReview: {
        status: reviewStatus,
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
        externalCallTarget: truncateAndRedact(link.externalCallSite?.targetExpression, MAX_MESSAGE_CHARS),
        storageLabel: link.storageLayoutEntry?.label ?? null,
        storageSlot: link.storageLayoutEntry?.slot ?? null
      })),
      p3Context: toBuildContext(finding.scan),
      p4AiValidation: {
        latestDecision: latestValidation?.decision ?? null,
        status: latestValidation?.aiValidationRun.status ?? null,
        reasoningSummary: truncateAndRedact(latestValidation?.reasoningSummary, MAX_MESSAGE_CHARS),
        contradictionNotes: truncateAndRedact(latestValidation?.contradictionNotes, MAX_MESSAGE_CHARS),
        humanReviewerChecklist: latestValidation?.humanReviewerChecklist.map((item) => truncateAndRedact(item, 500) ?? "") ?? []
      }
    };

    return { pack, checksum: checksumJson(pack) };
  }
}

function assessEligibility(input: {
  findingStatus: string;
  reviewStatus: string;
  evidenceCount: number;
  latestDecision: AiValidationDecision | null;
  hasExactSourceRange: boolean;
}): RemediationEligibility {
  if (input.evidenceCount === 0) {
    return notEligible("Finding has no persisted P1 evidence", !input.hasExactSourceRange);
  }
  if (input.findingStatus === "SUPPRESSED" || input.reviewStatus === "SUPPRESSED") {
    return notEligible("Suppressed findings are not eligible for remediation", !input.hasExactSourceRange);
  }
  if (!ELIGIBLE_REVIEW_STATUSES.has(input.reviewStatus)) {
    return notEligible(`Review status ${input.reviewStatus} is not eligible for remediation`, !input.hasExactSourceRange);
  }
  if (input.latestDecision && DISQUALIFYING_AI_DECISIONS.has(input.latestDecision)) {
    return notEligible(`AI validation decision ${input.latestDecision} is not eligible for remediation`, !input.hasExactSourceRange);
  }
  return {
    eligible: true,
    status: "ELIGIBLE",
    reason: null,
    guidanceOnly: !input.hasExactSourceRange
  };
}

function notEligible(reason: string, guidanceOnly: boolean): RemediationEligibility {
  return {
    eligible: false,
    status: "NOT_ELIGIBLE",
    reason,
    guidanceOnly
  };
}

function buildLimitations(
  evidenceCount: number,
  sourceLocationCount: number,
  latestDecision: AiValidationDecision | null
): string[] {
  const limitations = [
    "Remediation output is a suggestion only and requires human review.",
    "P5 does not apply patches, create pull requests, execute exploit simulations, or mark findings confirmed."
  ];
  if (evidenceCount === 0) {
    limitations.push("No persisted P1 evidence was available.");
  }
  if (sourceLocationCount === 0) {
    limitations.push("No exact source range was available, so secure diff suggestions are disabled.");
  }
  if (!latestDecision) {
    limitations.push("No P4 AI validation decision was available.");
  }
  return limitations;
}

function eligibleSourceLocations(finding: {
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  sourceRanges: Array<{
    filePath: string;
    startLine: number | null;
    endLine: number | null;
    startColumn: number | null;
    endColumn: number | null;
    snippet: string | null;
  }>;
  evidenceItems: Array<{
    filePath: string | null;
    startLine: number | null;
    endLine: number | null;
    startColumn: number | null;
    endColumn: number | null;
    snippet: string | null;
  }>;
  codeLinks: Array<{
    filePath: string | null;
    startLine: number | null;
    endLine: number | null;
    startColumn: number | null;
    endColumn: number | null;
  }>;
}) {
  const locations: RemediationPack["eligibleSourceLocations"] = [];
  const seen = new Set<string>();
  const add = (
    source: string,
    location: {
      filePath: string | null;
      startLine: number | null;
      endLine: number | null;
      startColumn?: number | null;
      endColumn?: number | null;
      snippet?: string | null;
    }
  ) => {
    if (!location.filePath || !location.startLine || !location.endLine) {
      return;
    }
    const key = `${location.filePath}:${location.startLine}:${location.endLine}:${source}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    locations.push({
      filePath: location.filePath,
      startLine: location.startLine,
      endLine: location.endLine,
      startColumn: location.startColumn ?? null,
      endColumn: location.endColumn ?? null,
      snippet: truncateAndRedact(location.snippet, MAX_SNIPPET_CHARS),
      source
    });
  };

  add("finding", {
    filePath: finding.filePath,
    startLine: finding.lineStart,
    endLine: finding.lineEnd,
    snippet: null
  });
  for (const range of finding.sourceRanges) add("source_range", range);
  for (const evidence of finding.evidenceItems) add("p1_evidence", evidence);
  for (const link of finding.codeLinks) add("p2b_code_link", link);

  return locations.slice(0, 8);
}

function scanContextInclude() {
  return {
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
    }
  } satisfies Prisma.ScanInclude;
}

function toBuildContext(scan: {
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
}): RemediationPack["p3Context"] {
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

function checksumJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
