import type {
  AnalyzerType,
  ThreatIntelConfidence,
  ThreatIntelSourceType,
  ThreatMatchStatus,
  ThreatSignatureKind,
  VulnerabilityCategory,
  VulnerabilitySeverity
} from "@prisma/client";
import { ApiError } from "../../common/errors/api-error.js";
import {
  assertHasProvenance,
  assertNoExploitInstructions,
  assertSafeWalletOrContractLabel,
  hasProvenance,
  THREAT_KNOWLEDGE_SAFETY_POLICY,
  type ProvenanceInput
} from "./threat-policy.js";
import {
  ThreatKnowledgeRepository,
  type ThreatActor,
  type ThreatSignatureMatchInput
} from "./threat.repository.js";
import { UsageLimitService } from "../usage/usage-limits.service.js";

export interface CreateThreatIntelRequest extends ProvenanceInput {
  projectId?: string | undefined;
  scanId?: string | undefined;
  findingId?: string | undefined;
  alertId?: string | undefined;
  sourceType: ThreatIntelSourceType;
  confidence: ThreatIntelConfidence;
  title: string;
  summary: string;
  reviewerNotes?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  sources?: Array<ProvenanceInput & {
    sourceType: ThreatIntelSourceType;
    title?: string | undefined;
    confidence: ThreatIntelConfidence;
    artifactPath?: string | undefined;
    artifactChecksumSha256?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  }> | undefined;
  incidentReferences?: Array<{
    sourceType: ThreatIntelSourceType;
    title: string;
    url?: string | undefined;
    referenceHash?: string | undefined;
    summary: string;
    confidence: ThreatIntelConfidence;
    metadata?: Record<string, unknown> | undefined;
  }> | undefined;
}

export interface CreateThreatSignatureRequest extends ProvenanceInput {
  projectId?: string | undefined;
  threatIntelEntryId?: string | undefined;
  sourceId?: string | undefined;
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
  conditions?: Array<{
    conditionKey: string;
    conditionType: string;
    operator: string;
    expectedValue?: unknown;
    evidenceType?: string | undefined;
    required: boolean;
    metadata?: Record<string, unknown> | undefined;
  }> | undefined;
}

export interface FalsePositiveFeedbackRequest {
  reason: string;
  evidenceIds: string[];
  signatureId?: string | undefined;
  signatureMatchId?: string | undefined;
  confidence: ThreatIntelConfidence;
  reviewerNotes?: string | undefined;
}

export interface ThreatIntelImportRequest {
  importReference: string;
  entries: Array<CreateThreatIntelRequest & {
    signatures?: CreateThreatSignatureRequest[] | undefined;
    walletLabels?: Array<ProvenanceInput & {
      projectId?: string | undefined;
      chainId?: number | undefined;
      address: string;
      label: string;
      confidence: ThreatIntelConfidence;
      notes?: string | undefined;
      metadata?: Record<string, unknown> | undefined;
    }> | undefined;
    contractLabels?: Array<ProvenanceInput & {
      projectId?: string | undefined;
      chainId?: number | undefined;
      address: string;
      label: string;
      confidence: ThreatIntelConfidence;
      notes?: string | undefined;
      metadata?: Record<string, unknown> | undefined;
    }> | undefined;
  }>;
}

type ScanForMatching = NonNullable<Awaited<ReturnType<ThreatKnowledgeRepository["scanForMatching"]>>>;
type ScanFinding = ScanForMatching["vulnerabilities"][number];
type ScanAlert = ScanForMatching["monitorAlerts"][number];
type ThreatSignatureForMatch = NonNullable<Awaited<ReturnType<ThreatKnowledgeRepository["getThreatSignature"]>>>;
type PrecisionFinding = Awaited<ReturnType<ThreatKnowledgeRepository["findingsForPrecision"]>>[number];

export class ThreatKnowledgeService {
  constructor(
    private readonly repository = new ThreatKnowledgeRepository(),
    private readonly usageLimits = new UsageLimitService()
  ) {}

  async listThreatIntel(organizationId: string, filters: {
    projectId?: string | undefined;
    scanId?: string | undefined;
    findingId?: string | undefined;
    sourceType?: ThreatIntelSourceType | undefined;
    confidence?: ThreatIntelConfidence | undefined;
    limit: number;
  }) {
    return {
      policy: THREAT_KNOWLEDGE_SAFETY_POLICY,
      entries: await this.repository.listThreatIntel(organizationId, filters)
    };
  }

  async createThreatIntel(actor: ThreatActor, input: CreateThreatIntelRequest) {
    assertNoExploitInstructions(input);
    if (!hasProvenance(input) && !input.sources?.some(hasProvenance)) {
      throw ApiError.badRequest("Threat intel entries require provenance or a provenance-backed source");
    }
    input.sources?.forEach((source) => assertHasProvenance(source, "Threat source"));
    input.incidentReferences?.forEach((reference) => {
      if (!reference.url && !reference.referenceHash) {
        throw ApiError.badRequest("Incident references require a URL or reference hash");
      }
    });

    const entry = await this.repository.createThreatIntel({
      ...actor,
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
      metadata: input.metadata
    });

    const sources = [];
    for (const source of input.sources ?? []) {
      sources.push(await this.repository.createThreatSource({
        ...actor,
        threatIntelEntryId: entry.id,
        projectId: input.projectId ?? null,
        scanId: input.scanId ?? null,
        sourceType: source.sourceType,
        title: source.title ?? null,
        provenanceUrl: source.provenanceUrl ?? null,
        provenanceHash: source.provenanceHash ?? null,
        provenanceReference: source.provenanceReference ?? null,
        artifactPath: source.artifactPath ?? null,
        artifactChecksumSha256: source.artifactChecksumSha256 ?? null,
        confidence: source.confidence,
        metadata: source.metadata
      }));
    }

    const incidentReferences = [];
    for (const reference of input.incidentReferences ?? []) {
      incidentReferences.push(await this.repository.createIncidentReference({
        organizationId: actor.organizationId,
        projectId: input.projectId ?? null,
        scanId: input.scanId ?? null,
        findingId: input.findingId ?? null,
        alertId: input.alertId ?? null,
        threatIntelEntryId: entry.id,
        sourceType: reference.sourceType,
        title: reference.title,
        url: reference.url ?? null,
        referenceHash: reference.referenceHash ?? null,
        summary: reference.summary,
        confidence: reference.confidence,
        metadata: reference.metadata
      }));
    }

    await this.repository.createRevision({
      organizationId: actor.organizationId,
      projectId: input.projectId ?? null,
      scanId: input.scanId ?? null,
      findingId: input.findingId ?? null,
      threatIntelEntryId: entry.id,
      entityType: "THREAT_INTEL_ENTRY",
      entityId: entry.id,
      action: "CREATE",
      newValue: { title: entry.title, sourceType: entry.sourceType, confidence: entry.confidence },
      actorUserId: actor.actorUserId ?? null,
      sourceType: input.sourceType,
      provenanceReference: input.provenanceReference ?? input.provenanceUrl ?? input.provenanceHash ?? null
    });

    return { entry, sources, incidentReferences };
  }

  async listThreatSignatures(organizationId: string, filters: {
    projectId?: string | undefined;
    kind?: ThreatSignatureKind | undefined;
    limit: number;
  }) {
    return {
      policy: THREAT_KNOWLEDGE_SAFETY_POLICY,
      signatures: await this.repository.listThreatSignatures(organizationId, filters)
    };
  }

  async createThreatSignature(actor: ThreatActor, input: CreateThreatSignatureRequest) {
    assertNoExploitInstructions(input);
    if (!hasProvenance(input) && !input.threatIntelEntryId) {
      throw ApiError.badRequest("Threat signatures require provenance or a linked threat intel entry");
    }

    const signature = await this.repository.createThreatSignature({
      ...actor,
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
      pattern: withProvenancePattern(input.pattern, input),
      metadata: input.metadata
    });

    for (const condition of input.conditions ?? []) {
      await this.repository.createThreatSignatureCondition({
        ...actor,
        projectId: input.projectId ?? null,
        signatureId: signature.id,
        conditionKey: condition.conditionKey,
        conditionType: condition.conditionType,
        operator: condition.operator,
        expectedValue: condition.expectedValue,
        evidenceType: condition.evidenceType ?? null,
        required: condition.required,
        metadata: condition.metadata
      });
    }

    await this.repository.createRevision({
      organizationId: actor.organizationId,
      projectId: input.projectId ?? null,
      threatIntelEntryId: input.threatIntelEntryId ?? null,
      threatSignatureId: signature.id,
      entityType: "THREAT_SIGNATURE",
      entityId: signature.id,
      action: "CREATE",
      newValue: { name: signature.name, kind: signature.kind, confidence: signature.confidence },
      actorUserId: actor.actorUserId ?? null,
      provenanceReference: input.provenanceReference ?? input.provenanceUrl ?? input.provenanceHash ?? null
    });

    return this.repository.getThreatSignature(signature.id, actor.organizationId);
  }

  async getThreatSignature(signatureId: string, organizationId: string) {
    const signature = await this.repository.getThreatSignature(signatureId, organizationId);
    if (!signature) throw ApiError.notFound("Threat signature");
    return signature;
  }

  async matchSignatureToScan(signatureId: string, scanId: string, actor: ThreatActor) {
    const signature = await this.getThreatSignature(signatureId, actor.organizationId);
    const scan = await this.repository.scanForMatching(scanId, actor.organizationId);
    if (!scan) throw ApiError.notFound("Scan");

    const candidates = evaluateSignatureAgainstScan(signature, scan, actor.organizationId);
    const persisted = [];
    for (const candidate of candidates) {
      await this.usageLimits.assertAndConsume(actor.organizationId, "THREAT_MATCHES_PER_MONTH", {
        resourceType: "THREAT_SIGNATURE_MATCH"
      });
      persisted.push(await this.repository.upsertSignatureMatch(candidate));
    }

    await this.repository.createRevision({
      organizationId: actor.organizationId,
      projectId: scan.projectId ?? null,
      scanId: scan.id,
      threatSignatureId: signature.id,
      entityType: "THREAT_SIGNATURE_MATCH",
      entityId: signature.id,
      action: "MATCH_SCAN",
      newValue: { scanId, matchCount: persisted.length },
      actorUserId: actor.actorUserId ?? null,
      provenanceReference: "P10_MATCHER_PERSISTED_EVIDENCE_ONLY"
    });

    return {
      policy: THREAT_KNOWLEDGE_SAFETY_POLICY,
      scanId,
      signatureId,
      matches: persisted
    };
  }

  async listScanMatches(scanId: string, organizationId: string) {
    return { matches: await this.repository.listScanMatches(scanId, organizationId) };
  }

  async listFindingMatches(findingId: string, organizationId: string) {
    return { matches: await this.repository.listFindingMatches(findingId, organizationId) };
  }

  async listDetectorPrecision(organizationId: string, filters: {
    projectId?: string | undefined;
    scanId?: string | undefined;
    analyzer?: string | undefined;
    ruleId?: string | undefined;
    limit: number;
  }) {
    return {
      metrics: await this.repository.listPrecisionMetrics(organizationId, {
        ...filters,
        analyzer: filters.analyzer as AnalyzerType | undefined
      })
    };
  }

  async addFalsePositiveFeedback(findingId: string, actor: ThreatActor, input: FalsePositiveFeedbackRequest) {
    assertNoExploitInstructions(input);
    const finding = await this.repository.findingForFeedback(findingId, actor.organizationId);
    if (!finding) throw ApiError.notFound("Finding");

    const feedback = await this.repository.createFalsePositiveFeedback({
      ...actor,
      projectId: finding.scan.projectId ?? null,
      scanId: finding.scanId,
      findingId,
      signatureId: input.signatureId ?? null,
      signatureMatchId: input.signatureMatchId ?? null,
      reason: input.reason,
      evidenceIds: input.evidenceIds,
      confidence: input.confidence,
      reviewerNotes: input.reviewerNotes ?? null
    });

    await this.repository.createRevision({
      organizationId: actor.organizationId,
      projectId: finding.scan.projectId ?? null,
      scanId: finding.scanId,
      findingId,
      threatSignatureId: input.signatureId ?? null,
      entityType: "FALSE_POSITIVE_FEEDBACK",
      entityId: feedback.id,
      action: "CREATE",
      newValue: { reason: input.reason, evidenceIds: input.evidenceIds, confidence: input.confidence },
      actorUserId: actor.actorUserId ?? null,
      reason: input.reason,
      sourceType: "USER_FEEDBACK",
      provenanceReference: "REVIEWER_FALSE_POSITIVE_FEEDBACK"
    });

    const metric = await this.refreshPrecisionForFinding(finding);
    return { feedback, detectorPrecisionMetric: metric };
  }

  async listFalsePositiveFeedback(findingId: string, organizationId: string) {
    return { feedback: await this.repository.listFalsePositiveFeedback(findingId, organizationId) };
  }

  async scanThreatSummary(scanId: string, organizationId: string) {
    const summary = await this.repository.scanThreatSummary(scanId, organizationId);
    if (!summary) throw ApiError.notFound("Scan");
    const highConfidenceMatches = summary.threatSignatureMatches.filter((match) =>
      ["HIGH", "VERIFIED"].includes(match.confidence)
    ).length;
    return {
      policy: THREAT_KNOWLEDGE_SAFETY_POLICY,
      scanId,
      matchCount: summary.threatSignatureMatches.length,
      highConfidenceMatches,
      falsePositiveFeedbackCount: summary.falsePositiveFeedback.length,
      incidentReferenceCount: summary.incidentReferences.length,
      threatIntelEntryCount: summary.threatIntelEntries.length,
      matches: summary.threatSignatureMatches,
      detectorPrecisionMetrics: summary.detectorPrecisionMetrics,
      falsePositiveFeedback: summary.falsePositiveFeedback,
      incidentReferences: summary.incidentReferences,
      limitations: [
        "Signature matches are not proof of exploitability.",
        "Threat knowledge signals require human review.",
        "P10 does not auto-confirm findings or change severity, confidence, review, or remediation status."
      ]
    };
  }

  async importThreatIntel(actor: ThreatActor, input: ThreatIntelImportRequest) {
    assertNoExploitInstructions(input);
    const imported = [];
    for (const entryInput of input.entries) {
      const created = await this.createThreatIntel(actor, {
        ...entryInput,
        provenanceReference: entryInput.provenanceReference ?? input.importReference
      });
      for (const signature of entryInput.signatures ?? []) {
        await this.createThreatSignature(actor, {
          ...signature,
          threatIntelEntryId: created.entry.id,
          provenanceReference: signature.provenanceReference ?? entryInput.provenanceReference ?? input.importReference
        });
      }
      for (const label of entryInput.walletLabels ?? []) {
        await this.createWalletRiskLabel(actor, {
          ...label,
          provenanceReference: label.provenanceReference ?? input.importReference
        });
      }
      for (const label of entryInput.contractLabels ?? []) {
        await this.createContractRiskLabel(actor, {
          ...label,
          provenanceReference: label.provenanceReference ?? input.importReference
        });
      }
      await this.repository.createRevision({
        organizationId: actor.organizationId,
        projectId: entryInput.projectId ?? null,
        scanId: entryInput.scanId ?? null,
        findingId: entryInput.findingId ?? null,
        threatIntelEntryId: created.entry.id,
        entityType: "THREAT_INTEL_IMPORT",
        entityId: created.entry.id,
        action: "IMPORT",
        newValue: { importReference: input.importReference, title: created.entry.title },
        actorUserId: actor.actorUserId ?? null,
        sourceType: entryInput.sourceType,
        provenanceReference: input.importReference
      });
      imported.push(created.entry);
    }
    return { importedCount: imported.length, entries: imported };
  }

  async createWalletRiskLabel(actor: ThreatActor, input: ProvenanceInput & {
    projectId?: string | undefined;
    chainId?: number | undefined;
    address: string;
    label: string;
    confidence: ThreatIntelConfidence;
    notes?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    assertHasProvenance(input, "Wallet risk label");
    assertSafeWalletOrContractLabel(input.label);
    return this.repository.createWalletRiskLabel({
      ...actor,
      projectId: input.projectId ?? null,
      chainId: input.chainId ?? null,
      address: input.address,
      normalizedAddress: normalizeAddress(input.address),
      label: input.label,
      confidence: input.confidence,
      provenanceUrl: input.provenanceUrl ?? null,
      provenanceHash: input.provenanceHash ?? null,
      provenanceReference: input.provenanceReference ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata
    });
  }

  async createContractRiskLabel(actor: ThreatActor, input: ProvenanceInput & {
    projectId?: string | undefined;
    chainId?: number | undefined;
    address: string;
    label: string;
    confidence: ThreatIntelConfidence;
    notes?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
  }) {
    assertHasProvenance(input, "Contract risk label");
    assertSafeWalletOrContractLabel(input.label);
    return this.repository.createContractRiskLabel({
      ...actor,
      projectId: input.projectId ?? null,
      chainId: input.chainId ?? null,
      address: input.address,
      normalizedAddress: normalizeAddress(input.address),
      label: input.label,
      confidence: input.confidence,
      provenanceUrl: input.provenanceUrl ?? null,
      provenanceHash: input.provenanceHash ?? null,
      provenanceReference: input.provenanceReference ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata
    });
  }

  private async refreshPrecisionForFinding(finding: Awaited<ReturnType<ThreatKnowledgeRepository["findingForFeedback"]>>) {
    if (!finding) return null;
    const findings = await this.repository.findingsForPrecision(
      finding.scan.organizationId,
      finding.analyzer,
      finding.externalRuleId,
      finding.severity
    );
    const snapshot = computePrecisionSnapshot(findings);
    return this.repository.upsertPrecisionMetric({
      organizationId: finding.scan.organizationId,
      projectId: finding.scan.projectId ?? null,
      scanId: finding.scanId,
      findingId: finding.id,
      analyzer: finding.analyzer,
      ruleId: finding.externalRuleId ?? null,
      severity: finding.severity,
      ...snapshot,
      confidenceCalibration: {
        basis: "persisted_review_feedback_ai_simulation_fuzz",
        policy: "quality_signal_only"
      },
      metadata: { p10: true }
    });
  }
}

export function computePrecisionSnapshot(findings: PrecisionFinding[]) {
  let acceptedCount = 0;
  let falsePositiveCount = 0;
  let suppressionCount = 0;
  let reproducedCount = 0;
  let notReproducedCount = 0;

  for (const finding of findings) {
    if (finding.review?.status === "ACCEPTED" || finding.status === "ACKNOWLEDGED") acceptedCount += 1;
    if (finding.review?.status === "FALSE_POSITIVE" || finding.status === "FALSE_POSITIVE") falsePositiveCount += 1;
    if (finding.falsePositiveFeedback.length > 0) falsePositiveCount += finding.falsePositiveFeedback.length;
    if (finding.review?.status === "SUPPRESSED" || finding.status === "SUPPRESSED") suppressionCount += 1;
    if (finding.aiFindingValidations.some((validation) =>
      ["LIKELY_FALSE_POSITIVE", "CONTRADICTED", "NOT_ENOUGH_EVIDENCE"].includes(validation.decision)
    )) falsePositiveCount += 1;
    if (finding.simulationDecisions.some((decision) => decision.decision === "REPRODUCED")) reproducedCount += 1;
    if (finding.simulationDecisions.some((decision) => decision.decision === "NOT_REPRODUCED")) notReproducedCount += 1;
    if (finding.fuzzRuns.some((run) => run.status === "FAILED" || run.invariantStatus === "FAILED")) reproducedCount += 1;
    if (finding.fuzzRuns.some((run) => run.status === "PASSED" || run.invariantStatus === "PASSED")) notReproducedCount += 1;
  }

  const truePositiveCount = acceptedCount + reproducedCount;
  const denominator = truePositiveCount + falsePositiveCount;
  const precisionEstimate = denominator === 0 ? 0 : Number((truePositiveCount / denominator).toFixed(2));

  return {
    truePositiveCount,
    falsePositiveCount,
    suppressionCount,
    acceptedCount,
    reproducedCount,
    notReproducedCount,
    precisionEstimate
  };
}

function evaluateSignatureAgainstScan(signature: ThreatSignatureForMatch, scan: ScanForMatching, organizationId: string): ThreatSignatureMatchInput[] {
  const matches: ThreatSignatureMatchInput[] = [];
  for (const finding of scan.vulnerabilities) {
    matches.push(evaluateFinding(signature, scan, finding, organizationId));
  }
  for (const alert of scan.monitorAlerts) {
    const alertMatch = evaluateAlert(signature, scan, alert, organizationId);
    if (alertMatch) matches.push(alertMatch);
  }
  return matches;
}

function evaluateFinding(signature: ThreatSignatureForMatch, scan: ScanForMatching, finding: ScanFinding, organizationId: string): ThreatSignatureMatchInput {
  const evidence = collectFindingEvidence(finding);
  const requiredMissing = missingRequiredEvidence(signature.evidenceRequirements, evidence);
  const family = signatureFamily(signature);
  const categoryMatch = categoryMatchesFamily(finding.category, family);
  const textMatch = textContainsFamily(`${finding.title} ${finding.description ?? ""} ${finding.externalRuleId ?? ""}`, family);
  const p7Reproduced = finding.simulationDecisions.some((decision) => decision.decision === "REPRODUCED");
  const p8Failed = finding.fuzzRuns.some((run) => run.status === "FAILED" || run.invariantStatus === "FAILED") ||
    finding.invariantResults.some((result) => result.status === "FAILED");

  let evidenceIdsUsed: string[] = [];
  let status: ThreatMatchStatus = "INCONCLUSIVE";
  let confidence: ThreatIntelConfidence = "LOW";
  let score = 0;
  let rationale = "Persisted evidence was insufficient for a defensive signature match.";

  if (family === "FAILED_INVARIANT_OR_FUZZ_COUNTEREXAMPLE" && p8Failed) {
    evidenceIdsUsed = evidence.p8;
    status = evidenceIdsUsed.length > 0 ? "MATCHED" : "INCONCLUSIVE";
    confidence = "HIGH";
    score = 0.88;
    rationale = "Persisted P8 fuzz or invariant failure evidence matches this defensive signature.";
  } else if (family === "REPRODUCED_LOCAL_SIMULATION" && p7Reproduced) {
    evidenceIdsUsed = evidence.p7;
    status = evidenceIdsUsed.length > 0 ? "MATCHED" : "INCONCLUSIVE";
    confidence = "HIGH";
    score = 0.86;
    rationale = "Persisted P7 local simulation reproduction evidence matches this defensive signature.";
  } else if (categoryMatch && evidence.all.length > 0) {
    evidenceIdsUsed = evidence.all;
    status = requiredMissing.length === 0 ? "MATCHED" : "PARTIAL";
    confidence = requiredMissing.length === 0 ? "MEDIUM" : "LOW";
    score = requiredMissing.length === 0 ? 0.72 : 0.48;
    rationale = "Finding category and persisted evidence match this defensive signature family.";
  } else if (textMatch && evidence.p1.length > 0) {
    evidenceIdsUsed = evidence.p1;
    status = "PARTIAL";
    confidence = "LOW";
    score = 0.35;
    rationale = "Finding text partially matches this defensive signature family using persisted finding evidence.";
  }

  if (evidenceIdsUsed.length === 0) {
    status = "INCONCLUSIVE";
    confidence = "LOW";
    score = 0;
  }

  return {
    organizationId,
    projectId: scan.projectId ?? null,
    scanId: scan.id,
    findingId: finding.id,
    alertId: null,
    signatureId: signature.id,
    status,
    confidence,
    matchScore: score,
    evidenceIdsUsed,
    missingEvidence: Array.from(new Set(requiredMissing)),
    suggestedPriorityAdjustment: status === "MATCHED" ? suggestedAdjustment(finding.severity, confidence) : null,
    humanReviewChecklist: reviewChecklist(signature.kind, status),
    rationale,
    metadata: {
      originalFindingStatus: finding.status,
      originalFindingSeverity: finding.severity,
      originalFindingConfidence: finding.confidence,
      noAutomaticFindingMutation: true
    }
  };
}

function evaluateAlert(signature: ThreatSignatureForMatch, scan: ScanForMatching, alert: ScanAlert, organizationId: string): ThreatSignatureMatchInput | null {
  const family = signatureFamily(signature);
  const highSeverity = alert.severity === "HIGH" || alert.severity === "CRITICAL";
  const kindMatches = (
    (family === "PROXY_UPGRADE" && alert.kind === "PROXY_UPGRADE") ||
    (family === "GOVERNANCE" && ["ADMIN_ROLE_CHANGE", "OWNERSHIP_TRANSFER", "PAUSE_UNPAUSE"].includes(alert.kind)) ||
    (family === "HIGH_SEVERITY_MONITOR_ALERT" && highSeverity)
  );
  if (!kindMatches) return null;

  const evidenceIdsUsed = alert.evidence.map((item) => item.id);
  const missingEvidence = evidenceIdsUsed.length === 0 ? ["P9 alert evidence"] : [];
  return {
    organizationId,
    projectId: scan.projectId ?? null,
    scanId: scan.id,
    findingId: null,
    alertId: alert.id,
    signatureId: signature.id,
    status: evidenceIdsUsed.length > 0 ? "MATCHED" : "INCONCLUSIVE",
    confidence: evidenceIdsUsed.length > 0 ? "HIGH" : "LOW",
    matchScore: evidenceIdsUsed.length > 0 ? 0.82 : 0,
    evidenceIdsUsed,
    missingEvidence,
    suggestedPriorityAdjustment: evidenceIdsUsed.length > 0 ? 0.15 : null,
    humanReviewChecklist: reviewChecklist(signature.kind, evidenceIdsUsed.length > 0 ? "MATCHED" : "INCONCLUSIVE"),
    rationale: evidenceIdsUsed.length > 0
      ? "Persisted P9 monitoring alert evidence matches this defensive signature."
      : "A P9 monitoring alert exists, but no persisted evidence was available for a match.",
    metadata: {
      alertKind: alert.kind,
      alertSeverity: alert.severity,
      noAutomaticFindingMutation: true
    }
  };
}

function collectFindingEvidence(finding: ScanFinding) {
  const p1 = finding.evidenceItems.map((item) => item.id);
  const p2b = finding.codeLinks.map((item) => item.id);
  const p4 = finding.aiFindingValidations.flatMap((item) => item.evidenceIdsUsed.length > 0 ? [item.id, ...item.evidenceIdsUsed] : [item.id]);
  const p7 = finding.simulationDecisions.flatMap((item) => item.evidenceArtifactIds.length > 0 ? [item.id, ...item.evidenceArtifactIds] : [item.id]);
  const p8 = [
    ...finding.fuzzRuns.map((item) => item.id),
    ...finding.fuzzCounterexamples.map((item) => item.id),
    ...finding.invariantResults.map((item) => item.id)
  ];
  return {
    p1,
    p2b,
    p4,
    p7,
    p8,
    all: [...p1, ...p2b, ...p4, ...p7, ...p8]
  };
}

function missingRequiredEvidence(requirements: string[], evidence: ReturnType<typeof collectFindingEvidence>): string[] {
  const missing: string[] = [];
  for (const requirement of requirements) {
    const normalized = requirement.toLowerCase();
    if (normalized.includes("p1") || normalized.includes("finding evidence")) {
      if (evidence.p1.length === 0) missing.push(requirement);
    } else if (normalized.includes("p2") || normalized.includes("code") || normalized.includes("external call") || normalized.includes("storage")) {
      if (evidence.p2b.length === 0) missing.push(requirement);
    } else if (normalized.includes("p4") || normalized.includes("ai")) {
      if (evidence.p4.length === 0) missing.push(requirement);
    } else if (normalized.includes("p7") || normalized.includes("simulation")) {
      if (evidence.p7.length === 0) missing.push(requirement);
    } else if (normalized.includes("p8") || normalized.includes("fuzz") || normalized.includes("invariant")) {
      if (evidence.p8.length === 0) missing.push(requirement);
    } else if (evidence.all.length === 0) {
      missing.push(requirement);
    }
  }
  return missing;
}

function signatureFamily(signature: ThreatSignatureForMatch): string {
  const pattern = signature.pattern && typeof signature.pattern === "object" && !Array.isArray(signature.pattern)
    ? signature.pattern as Record<string, unknown>
    : {};
  if (typeof pattern.family === "string") return pattern.family;
  return signature.kind;
}

function categoryMatchesFamily(category: VulnerabilityCategory, family: string): boolean {
  const matches: Record<string, VulnerabilityCategory[]> = {
    REENTRANCY: ["REENTRANCY", "UNSAFE_EXTERNAL_CALL"],
    ACCESS_CONTROL: ["ACCESS_CONTROL", "OWNERSHIP", "SUSPICIOUS_OWNERSHIP"],
    ORACLE_MANIPULATION: ["ORACLE_MANIPULATION"],
    PROXY_UPGRADE: ["UPGRADEABILITY"],
    STORAGE_COLLISION: ["UPGRADEABILITY"],
    GOVERNANCE: ["OWNERSHIP", "SUSPICIOUS_OWNERSHIP", "ACCESS_CONTROL"],
    RUGPULL: ["RUG_PULL", "SUSPICIOUS_OWNERSHIP"],
    HONEYPOT: ["HONEYPOT"],
    DOS: ["DENIAL_OF_SERVICE"],
    INTEGER_PRECISION: ["INTEGER_OVERFLOW"],
    UNCHECKED_CALL: ["UNSAFE_EXTERNAL_CALL"],
    LIQUIDITY_RISK: ["RUG_PULL", "BUSINESS_LOGIC"]
  };
  return Boolean(matches[family]?.includes(category));
}

function textContainsFamily(text: string, family: string): boolean {
  const normalized = text.toLowerCase();
  const keywords: Record<string, string[]> = {
    REENTRANCY: ["reentrancy", "external call before state"],
    ACCESS_CONTROL: ["access control", "onlyowner", "privileged"],
    ORACLE_MANIPULATION: ["oracle", "price bounds", "sanity"],
    PROXY_UPGRADE: ["proxy", "upgrade", "eip-1967"],
    STORAGE_COLLISION: ["storage collision", "layout"],
    UNCHECKED_CALL: ["unchecked call", "low-level call"],
    GOVERNANCE: ["ownership", "role", "admin"],
    FAILED_INVARIANT_OR_FUZZ_COUNTEREXAMPLE: ["invariant", "counterexample"],
    REPRODUCED_LOCAL_SIMULATION: ["simulation", "reproduced"]
  };
  return Boolean(keywords[family]?.some((keyword) => normalized.includes(keyword)));
}

function suggestedAdjustment(severity: VulnerabilitySeverity, confidence: ThreatIntelConfidence): number {
  if (confidence === "HIGH" || confidence === "VERIFIED") return 0.2;
  if (severity === "CRITICAL" || severity === "HIGH") return 0.15;
  return 0.08;
}

function reviewChecklist(kind: ThreatSignatureKind, status: ThreatMatchStatus): string[] {
  const base = [
    "Review persisted evidence IDs before changing finding state.",
    "Confirm source/provenance and rule assumptions.",
    "Do not treat signature match alone as proof."
  ];
  if (status === "INCONCLUSIVE") return [...base, "Collect the missing evidence listed on the match before prioritizing."];
  if (kind === "REENTRANCY") return [...base, "Check state update order and reentrancy guards."];
  if (kind === "ACCESS_CONTROL") return [...base, "Verify caller authorization on privileged state changes."];
  if (kind === "PROXY_UPGRADE" || kind === "STORAGE_COLLISION") return [...base, "Review proxy admin authority and storage layout compatibility."];
  if (kind === "ORACLE_MANIPULATION") return [...base, "Review reference feed assumptions and sanity bounds."];
  return base;
}

function withProvenancePattern(pattern: Record<string, unknown> | undefined, input: ProvenanceInput) {
  return {
    ...(pattern ?? {}),
    provenance: {
      url: input.provenanceUrl ?? null,
      hash: input.provenanceHash ?? null,
      reference: input.provenanceReference ?? null
    },
    defensiveOnly: true,
    noExploitSteps: true
  };
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}
