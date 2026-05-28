import type {
  AnalyzerType,
  Prisma,
  ThreatIntelConfidence,
  ThreatIntelSourceType,
  ThreatMatchStatus,
  ThreatSignatureKind,
  VulnerabilitySeverity
} from "@prisma/client";
import { prisma } from "../../infra/prisma/prisma.js";

export interface ThreatActor {
  organizationId: string;
  actorUserId?: string | undefined;
}

export interface CreateThreatIntelInput extends ThreatActor {
  projectId?: string | null | undefined;
  scanId?: string | null | undefined;
  findingId?: string | null | undefined;
  alertId?: string | null | undefined;
  sourceType: ThreatIntelSourceType;
  confidence: ThreatIntelConfidence;
  title: string;
  summary: string;
  provenanceUrl?: string | null | undefined;
  provenanceHash?: string | null | undefined;
  provenanceReference?: string | null | undefined;
  reviewerNotes?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface CreateThreatSourceInput extends ThreatActor {
  threatIntelEntryId?: string | null | undefined;
  projectId?: string | null | undefined;
  scanId?: string | null | undefined;
  sourceType: ThreatIntelSourceType;
  title?: string | null | undefined;
  provenanceUrl?: string | null | undefined;
  provenanceHash?: string | null | undefined;
  provenanceReference?: string | null | undefined;
  artifactPath?: string | null | undefined;
  artifactChecksumSha256?: string | null | undefined;
  confidence: ThreatIntelConfidence;
  metadata?: Record<string, unknown> | undefined;
}

export interface CreateThreatSignatureInput extends ThreatActor {
  projectId?: string | null | undefined;
  threatIntelEntryId?: string | null | undefined;
  sourceId?: string | null | undefined;
  kind: ThreatSignatureKind;
  name: string;
  description: string;
  defensiveSummary: string;
  confidence: ThreatIntelConfidence;
  affectedAnalyzers: string[];
  affectedRuleIds: string[];
  evidenceRequirements: string[];
  pattern?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface CreateThreatSignatureConditionInput extends ThreatActor {
  projectId?: string | null | undefined;
  signatureId: string;
  conditionKey: string;
  conditionType: string;
  operator: string;
  expectedValue?: unknown;
  evidenceType?: string | null | undefined;
  required: boolean;
  metadata?: Record<string, unknown> | undefined;
}

export interface ThreatSignatureMatchInput extends ThreatActor {
  projectId?: string | null | undefined;
  scanId?: string | null | undefined;
  findingId?: string | null | undefined;
  alertId?: string | null | undefined;
  signatureId: string;
  status: ThreatMatchStatus;
  confidence: ThreatIntelConfidence;
  matchScore: number;
  evidenceIdsUsed: string[];
  missingEvidence: string[];
  suggestedPriorityAdjustment?: number | null | undefined;
  humanReviewChecklist: string[];
  rationale: string;
  metadata?: Record<string, unknown> | undefined;
}

export interface PrecisionMetricInput extends ThreatActor {
  projectId?: string | null | undefined;
  scanId?: string | null | undefined;
  findingId?: string | null | undefined;
  analyzer?: AnalyzerType | null | undefined;
  ruleId?: string | null | undefined;
  severity?: VulnerabilitySeverity | null | undefined;
  truePositiveCount: number;
  falsePositiveCount: number;
  suppressionCount: number;
  acceptedCount: number;
  reproducedCount: number;
  notReproducedCount: number;
  precisionEstimate: number;
  confidenceCalibration?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface FalsePositiveFeedbackInput extends ThreatActor {
  projectId?: string | null | undefined;
  scanId?: string | null | undefined;
  findingId: string;
  signatureId?: string | null | undefined;
  signatureMatchId?: string | null | undefined;
  reason: string;
  evidenceIds: string[];
  confidence: ThreatIntelConfidence;
  reviewerNotes?: string | null | undefined;
}

export class ThreatKnowledgeRepository {
  project(projectId: string, organizationId: string) {
    return prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: { id: true, organizationId: true }
    });
  }

  listThreatIntel(organizationId: string, filters: {
    projectId?: string | undefined;
    scanId?: string | undefined;
    findingId?: string | undefined;
    sourceType?: ThreatIntelSourceType | undefined;
    confidence?: ThreatIntelConfidence | undefined;
    limit: number;
  }) {
    return prisma.threatIntelEntry.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.scanId ? { scanId: filters.scanId } : {}),
        ...(filters.findingId ? { findingId: filters.findingId } : {}),
        ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
        ...(filters.confidence ? { confidence: filters.confidence } : {})
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filters.limit,
      include: {
        sources: { orderBy: { createdAt: "desc" } },
        incidentReferences: { orderBy: { createdAt: "desc" } },
        signatures: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } }
      }
    });
  }

  async createThreatIntel(input: CreateThreatIntelInput) {
    return prisma.threatIntelEntry.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        scanId: input.scanId ?? null,
        findingId: input.findingId ?? null,
        alertId: input.alertId ?? null,
        sourceType: input.sourceType,
        confidence: input.confidence,
        title: input.title,
        summary: input.summary,
        provenanceUrl: input.provenanceUrl ?? null,
        provenanceHash: input.provenanceHash ?? null,
        provenanceReference: input.provenanceReference ?? null,
        reviewerNotes: input.reviewerNotes ?? null,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {}),
        createdByUserId: input.actorUserId ?? null
      } satisfies Prisma.ThreatIntelEntryUncheckedCreateInput
    });
  }

  createThreatSource(input: CreateThreatSourceInput) {
    return prisma.threatSource.create({
      data: {
        threatIntelEntryId: input.threatIntelEntryId ?? null,
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        scanId: input.scanId ?? null,
        sourceType: input.sourceType,
        title: input.title ?? null,
        provenanceUrl: input.provenanceUrl ?? null,
        provenanceHash: input.provenanceHash ?? null,
        provenanceReference: input.provenanceReference ?? null,
        artifactPath: input.artifactPath ?? null,
        artifactChecksumSha256: input.artifactChecksumSha256 ?? null,
        confidence: input.confidence,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      } satisfies Prisma.ThreatSourceUncheckedCreateInput
    });
  }

  createIncidentReference(input: {
    organizationId: string;
    projectId?: string | null | undefined;
    scanId?: string | null | undefined;
    findingId?: string | null | undefined;
    alertId?: string | null | undefined;
    threatIntelEntryId?: string | null | undefined;
    sourceId?: string | null | undefined;
    sourceType: ThreatIntelSourceType;
    title: string;
    url?: string | null | undefined;
    referenceHash?: string | null | undefined;
    summary: string;
    confidence: ThreatIntelConfidence;
    metadata?: Record<string, unknown> | undefined;
  }) {
    return prisma.incidentReference.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        scanId: input.scanId ?? null,
        findingId: input.findingId ?? null,
        alertId: input.alertId ?? null,
        threatIntelEntryId: input.threatIntelEntryId ?? null,
        sourceId: input.sourceId ?? null,
        sourceType: input.sourceType,
        title: input.title,
        url: input.url ?? null,
        referenceHash: input.referenceHash ?? null,
        summary: input.summary,
        confidence: input.confidence,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      } satisfies Prisma.IncidentReferenceUncheckedCreateInput
    });
  }

  listThreatSignatures(organizationId: string, filters: {
    projectId?: string | undefined;
    kind?: ThreatSignatureKind | undefined;
    limit: number;
  }) {
    return prisma.threatSignature.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.kind ? { kind: filters.kind } : {})
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: filters.limit,
      include: signatureInclude()
    });
  }

  createThreatSignature(input: CreateThreatSignatureInput) {
    return prisma.threatSignature.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        threatIntelEntryId: input.threatIntelEntryId ?? null,
        sourceId: input.sourceId ?? null,
        kind: input.kind,
        name: input.name,
        description: input.description,
        defensiveSummary: input.defensiveSummary,
        confidence: input.confidence,
        affectedAnalyzers: input.affectedAnalyzers,
        affectedRuleIds: input.affectedRuleIds,
        evidenceRequirements: input.evidenceRequirements,
        ...(input.pattern ? { pattern: toJsonValue(input.pattern) } : {}),
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {}),
        createdByUserId: input.actorUserId ?? null
      } satisfies Prisma.ThreatSignatureUncheckedCreateInput,
      include: signatureInclude()
    });
  }

  createThreatSignatureCondition(input: CreateThreatSignatureConditionInput) {
    return prisma.threatSignatureCondition.create({
      data: {
        signatureId: input.signatureId,
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        conditionKey: input.conditionKey,
        conditionType: input.conditionType,
        operator: input.operator,
        ...(input.expectedValue === undefined ? {} : { expectedValue: toJsonValue(input.expectedValue) }),
        evidenceType: input.evidenceType ?? null,
        required: input.required,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      } satisfies Prisma.ThreatSignatureConditionUncheckedCreateInput
    });
  }

  getThreatSignature(signatureId: string, organizationId: string) {
    return prisma.threatSignature.findFirst({
      where: { id: signatureId, organizationId, deletedAt: null },
      include: signatureInclude()
    });
  }

  scanForMatching(scanId: string, organizationId: string) {
    return prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      include: {
        buildRuns: { orderBy: { createdAt: "desc" }, take: 5 },
        compilerArtifacts: { orderBy: { createdAt: "desc" }, take: 20 },
        testRuns: { orderBy: { createdAt: "desc" }, take: 10 },
        vulnerabilities: {
          where: { deletedAt: null },
          orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
          include: {
            evidenceItems: { orderBy: { createdAt: "asc" } },
            review: true,
            codeLinks: {
              include: {
                functionSymbol: true,
                externalCallSite: true,
                storageLayoutEntry: true
              }
            },
            aiFindingValidations: { orderBy: { createdAt: "desc" }, take: 5 },
            simulationRuns: { orderBy: { createdAt: "desc" }, take: 5 },
            simulationDecisions: { orderBy: { createdAt: "desc" }, take: 5 },
            fuzzRuns: {
              orderBy: { createdAt: "desc" },
              take: 5,
              include: {
                counterexamples: { orderBy: { createdAt: "desc" }, take: 5 },
                invariantResults: { orderBy: { createdAt: "desc" }, take: 5 }
              }
            },
            fuzzCounterexamples: { orderBy: { createdAt: "desc" }, take: 5 },
            invariantResults: { orderBy: { createdAt: "desc" }, take: 5 }
          }
        },
        monitorAlerts: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { evidence: { orderBy: { createdAt: "asc" } } }
        }
      }
    });
  }

  async upsertSignatureMatch(input: ThreatSignatureMatchInput) {
    const existing = await prisma.threatSignatureMatch.findFirst({
      where: {
        signatureId: input.signatureId,
        findingId: input.findingId ?? null,
        alertId: input.alertId ?? null,
        scanId: input.scanId ?? null,
        organizationId: input.organizationId
      }
    });
    const data = {
      signatureId: input.signatureId,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      scanId: input.scanId ?? null,
      findingId: input.findingId ?? null,
      alertId: input.alertId ?? null,
      status: input.status,
      confidence: input.confidence,
      matchScore: input.matchScore,
      evidenceIdsUsed: input.evidenceIdsUsed,
      missingEvidence: input.missingEvidence,
      suggestedPriorityAdjustment: input.suggestedPriorityAdjustment ?? null,
      humanReviewChecklist: input.humanReviewChecklist,
      rationale: input.rationale,
      ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
    } satisfies Prisma.ThreatSignatureMatchUncheckedCreateInput;

    if (!existing) {
      return prisma.threatSignatureMatch.create({ data, include: matchInclude() });
    }
    return prisma.threatSignatureMatch.update({
      where: { id: existing.id },
      data,
      include: matchInclude()
    });
  }

  listScanMatches(scanId: string, organizationId: string) {
    return prisma.threatSignatureMatch.findMany({
      where: { scanId, organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: matchInclude()
    });
  }

  listFindingMatches(findingId: string, organizationId: string) {
    return prisma.threatSignatureMatch.findMany({
      where: { findingId, organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: matchInclude()
    });
  }

  listPrecisionMetrics(organizationId: string, filters: {
    projectId?: string | undefined;
    scanId?: string | undefined;
    analyzer?: AnalyzerType | undefined;
    ruleId?: string | undefined;
    limit: number;
  }) {
    return prisma.detectorPrecisionMetric.findMany({
      where: {
        organizationId,
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.scanId ? { scanId: filters.scanId } : {}),
        ...(filters.analyzer ? { analyzer: filters.analyzer } : {}),
        ...(filters.ruleId ? { ruleId: filters.ruleId } : {})
      },
      orderBy: [{ measuredAt: "desc" }, { id: "desc" }],
      take: filters.limit
    });
  }

  findingsForPrecision(organizationId: string, analyzer?: AnalyzerType | null, ruleId?: string | null, severity?: VulnerabilitySeverity | null) {
    return prisma.vulnerability.findMany({
      where: {
        scan: { organizationId },
        deletedAt: null,
        ...(analyzer ? { analyzer } : {}),
        ...(ruleId ? { externalRuleId: ruleId } : {}),
        ...(severity ? { severity } : {})
      },
      include: {
        review: true,
        falsePositiveFeedback: true,
        aiFindingValidations: { orderBy: { createdAt: "desc" }, take: 5 },
        simulationDecisions: { orderBy: { createdAt: "desc" }, take: 5 },
        fuzzRuns: { orderBy: { createdAt: "desc" }, take: 5 }
      }
    });
  }

  async upsertPrecisionMetric(input: PrecisionMetricInput) {
    const existing = await prisma.detectorPrecisionMetric.findFirst({
      where: {
        organizationId: input.organizationId,
        analyzer: input.analyzer ?? null,
        ruleId: input.ruleId ?? null,
        severity: input.severity ?? null
      }
    });
    const data = {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      scanId: input.scanId ?? null,
      findingId: input.findingId ?? null,
      analyzer: input.analyzer ?? null,
      ruleId: input.ruleId ?? null,
      severity: input.severity ?? null,
      truePositiveCount: input.truePositiveCount,
      falsePositiveCount: input.falsePositiveCount,
      suppressionCount: input.suppressionCount,
      acceptedCount: input.acceptedCount,
      reproducedCount: input.reproducedCount,
      notReproducedCount: input.notReproducedCount,
      precisionEstimate: input.precisionEstimate,
      ...(input.confidenceCalibration ? { confidenceCalibration: toJsonValue(input.confidenceCalibration) } : {}),
      ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {}),
      measuredAt: new Date()
    } satisfies Prisma.DetectorPrecisionMetricUncheckedCreateInput;
    if (!existing) return prisma.detectorPrecisionMetric.create({ data });
    return prisma.detectorPrecisionMetric.update({ where: { id: existing.id }, data });
  }

  findingForFeedback(findingId: string, organizationId: string) {
    return prisma.vulnerability.findFirst({
      where: { id: findingId, scan: { organizationId }, deletedAt: null },
      include: { scan: { select: { id: true, projectId: true, organizationId: true } } }
    });
  }

  createFalsePositiveFeedback(input: FalsePositiveFeedbackInput) {
    return prisma.falsePositiveFeedback.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        scanId: input.scanId ?? null,
        findingId: input.findingId,
        signatureId: input.signatureId ?? null,
        signatureMatchId: input.signatureMatchId ?? null,
        actorUserId: input.actorUserId ?? null,
        reason: input.reason,
        evidenceIds: input.evidenceIds,
        confidence: input.confidence,
        reviewerNotes: input.reviewerNotes ?? null
      } satisfies Prisma.FalsePositiveFeedbackUncheckedCreateInput
    });
  }

  listFalsePositiveFeedback(findingId: string, organizationId: string) {
    return prisma.falsePositiveFeedback.findMany({
      where: { findingId, organizationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        signature: { select: { id: true, name: true, kind: true, confidence: true } },
        signatureMatch: { select: { id: true, status: true, confidence: true, evidenceIdsUsed: true, missingEvidence: true } }
      }
    });
  }

  createRevision(input: {
    organizationId: string;
    projectId?: string | null | undefined;
    scanId?: string | null | undefined;
    findingId?: string | null | undefined;
    threatIntelEntryId?: string | null | undefined;
    threatSignatureId?: string | null | undefined;
    entityType: string;
    entityId: string;
    action: string;
    previousValue?: unknown;
    newValue?: unknown;
    actorUserId?: string | null | undefined;
    reason?: string | null | undefined;
    sourceType?: ThreatIntelSourceType | null | undefined;
    provenanceReference?: string | null | undefined;
  }) {
    return prisma.threatKnowledgeRevision.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        scanId: input.scanId ?? null,
        findingId: input.findingId ?? null,
        threatIntelEntryId: input.threatIntelEntryId ?? null,
        threatSignatureId: input.threatSignatureId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        ...(input.previousValue === undefined ? {} : { previousValue: toJsonValue(input.previousValue) }),
        ...(input.newValue === undefined ? {} : { newValue: toJsonValue(input.newValue) }),
        actorUserId: input.actorUserId ?? null,
        reason: input.reason ?? null,
        sourceType: input.sourceType ?? null,
        provenanceReference: input.provenanceReference ?? null
      } satisfies Prisma.ThreatKnowledgeRevisionUncheckedCreateInput
    });
  }

  scanThreatSummary(scanId: string, organizationId: string) {
    return prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        threatSignatureMatches: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: matchInclude()
        },
        detectorPrecisionMetrics: {
          orderBy: { measuredAt: "desc" },
          take: 25
        },
        falsePositiveFeedback: {
          orderBy: { createdAt: "desc" },
          take: 25
        },
        incidentReferences: {
          orderBy: { createdAt: "desc" },
          take: 25
        },
        threatIntelEntries: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 25
        }
      }
    });
  }

  createWalletRiskLabel(input: {
    organizationId: string;
    projectId?: string | null | undefined;
    chainId?: number | null | undefined;
    address: string;
    normalizedAddress: string;
    label: string;
    confidence: ThreatIntelConfidence;
    sourceId?: string | null | undefined;
    provenanceUrl?: string | null | undefined;
    provenanceHash?: string | null | undefined;
    provenanceReference?: string | null | undefined;
    notes?: string | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    return prisma.walletRiskLabel.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        chainId: input.chainId ?? null,
        address: input.address,
        normalizedAddress: input.normalizedAddress,
        label: input.label,
        confidence: input.confidence,
        sourceId: input.sourceId ?? null,
        provenanceUrl: input.provenanceUrl ?? null,
        provenanceHash: input.provenanceHash ?? null,
        provenanceReference: input.provenanceReference ?? null,
        notes: input.notes ?? null,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      } satisfies Prisma.WalletRiskLabelUncheckedCreateInput
    });
  }

  createContractRiskLabel(input: {
    organizationId: string;
    projectId?: string | null | undefined;
    chainId?: number | null | undefined;
    address: string;
    normalizedAddress: string;
    label: string;
    confidence: ThreatIntelConfidence;
    sourceId?: string | null | undefined;
    provenanceUrl?: string | null | undefined;
    provenanceHash?: string | null | undefined;
    provenanceReference?: string | null | undefined;
    notes?: string | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    return prisma.contractRiskLabel.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        chainId: input.chainId ?? null,
        address: input.address,
        normalizedAddress: input.normalizedAddress,
        label: input.label,
        confidence: input.confidence,
        sourceId: input.sourceId ?? null,
        provenanceUrl: input.provenanceUrl ?? null,
        provenanceHash: input.provenanceHash ?? null,
        provenanceReference: input.provenanceReference ?? null,
        notes: input.notes ?? null,
        ...(input.metadata ? { metadata: toJsonValue(input.metadata) } : {})
      } satisfies Prisma.ContractRiskLabelUncheckedCreateInput
    });
  }
}

function signatureInclude() {
  return {
    source: true,
    threatIntelEntry: { select: { id: true, title: true, sourceType: true, confidence: true, provenanceUrl: true, provenanceHash: true, provenanceReference: true } },
    conditions: { orderBy: { createdAt: "asc" } }
  } satisfies Prisma.ThreatSignatureInclude;
}

function matchInclude() {
  return {
    signature: { include: signatureInclude() },
    alert: { select: { id: true, title: true, severity: true, kind: true, transactionHash: true, blockNumber: true, logIndex: true } },
    finding: { select: { id: true, title: true, severity: true, confidence: true, status: true, analyzer: true, externalRuleId: true } }
  } satisfies Prisma.ThreatSignatureMatchInclude;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
