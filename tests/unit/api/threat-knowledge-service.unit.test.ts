import { describe, expect, it, vi } from "vitest";
import { ThreatKnowledgeService, computePrecisionSnapshot } from "../../../apps/api/src/modules/threat-knowledge/threat.service";

const actor = { organizationId: "11111111-1111-4111-8111-111111111111", actorUserId: "22222222-2222-4222-8222-222222222222" };

describe("ThreatKnowledgeService", () => {
  it("matches signatures using persisted evidence only and leaves finding status unchanged", async () => {
    const finding = persistedFinding({
      evidenceItems: [{ id: "evidence-1" }],
      codeLinks: [{ id: "code-link-1" }],
      status: "OPEN"
    });
    const persistedMatches: any[] = [];
    const service = new ThreatKnowledgeService(fakeRepository({
      scan: { vulnerabilities: [finding], monitorAlerts: [] },
      signature: threatSignature({ kind: "REENTRANCY", evidenceRequirements: ["P1 finding evidence", "P2B code link"] }),
      upsertSignatureMatch: vi.fn(async (input) => {
        persistedMatches.push(input);
        return { id: `match-${persistedMatches.length}`, ...input };
      })
    }) as never, fakeUsage() as never);

    const result = await service.matchSignatureToScan("signature-1", "scan-1", actor);

    expect(result.matches).toHaveLength(1);
    expect(persistedMatches[0].status).toBe("MATCHED");
    expect(persistedMatches[0].evidenceIdsUsed).toEqual(["evidence-1", "code-link-1"]);
    expect(persistedMatches[0].metadata.originalFindingStatus).toBe("OPEN");
    expect(finding.status).toBe("OPEN");
  });

  it("stores INCONCLUSIVE when required evidence is missing", async () => {
    const persistedMatches: any[] = [];
    const service = new ThreatKnowledgeService(fakeRepository({
      scan: { vulnerabilities: [persistedFinding({ evidenceItems: [], codeLinks: [] })], monitorAlerts: [] },
      signature: threatSignature({ kind: "ACCESS_CONTROL", evidenceRequirements: ["P1 finding evidence"] }),
      upsertSignatureMatch: vi.fn(async (input) => {
        persistedMatches.push(input);
        return { id: "match-1", ...input };
      })
    }) as never, fakeUsage() as never);

    await service.matchSignatureToScan("signature-1", "scan-1", actor);

    expect(persistedMatches[0].status).toBe("INCONCLUSIVE");
    expect(persistedMatches[0].evidenceIdsUsed).toEqual([]);
    expect(persistedMatches[0].missingEvidence).toContain("P1 finding evidence");
  });

  it("updates detector precision metrics from false-positive feedback without mutating the finding", async () => {
    const finding = persistedFinding({ id: "finding-1", status: "OPEN" });
    const upsertPrecisionMetric = vi.fn(async (input) => ({ id: "metric-1", ...input }));
    const service = new ThreatKnowledgeService(fakeRepository({
      findingForFeedback: vi.fn(async () => ({
        ...finding,
        analyzer: "SLITHER",
        externalRuleId: "reentrancy-eth",
        severity: "HIGH",
        scan: { id: "scan-1", projectId: "project-1", organizationId: actor.organizationId }
      })),
      createFalsePositiveFeedback: vi.fn(async (input) => ({ id: "feedback-1", ...input })),
      findingsForPrecision: vi.fn(async () => [
        precisionFinding({ reviewStatus: "ACCEPTED" }),
        precisionFinding({ feedbackCount: 1 }),
        precisionFinding({ aiDecision: "CONTRADICTED" }),
        precisionFinding({ simulationDecision: "REPRODUCED" })
      ]),
      upsertPrecisionMetric
    }) as never);

    const response = await service.addFalsePositiveFeedback("finding-1", actor, {
      reason: "Reviewer confirmed this path is guarded by an upstream invariant.",
      evidenceIds: ["evidence-1"],
      confidence: "MEDIUM"
    });

    expect(response.feedback.id).toBe("feedback-1");
    expect(upsertPrecisionMetric).toHaveBeenCalledWith(expect.objectContaining({
      truePositiveCount: 2,
      falsePositiveCount: 2,
      precisionEstimate: 0.5
    }));
    expect(finding.status).toBe("OPEN");
  });

  it("computes stable detector precision values", () => {
    const snapshot = computePrecisionSnapshot([
      precisionFinding({ reviewStatus: "ACCEPTED" }),
      precisionFinding({ feedbackCount: 2 }),
      precisionFinding({ simulationDecision: "NOT_REPRODUCED" }),
      precisionFinding({ fuzzStatus: "FAILED" })
    ] as never);

    expect(snapshot).toEqual(expect.objectContaining({
      truePositiveCount: 2,
      falsePositiveCount: 2,
      acceptedCount: 1,
      reproducedCount: 1,
      notReproducedCount: 1,
      precisionEstimate: 0.5
    }));
  });

  it("requires provenance for threat intel creation", async () => {
    const service = new ThreatKnowledgeService(fakeRepository() as never);

    await expect(service.createThreatIntel(actor, {
      sourceType: "PUBLIC_REPORT",
      confidence: "LOW",
      title: "Known defensive pattern",
      summary: "A provenance-free entry must be rejected by P10 policy."
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("requires provenance-backed wallet labels and rejects defamatory identity claims", async () => {
    const service = new ThreatKnowledgeService(fakeRepository() as never);

    await expect(service.createWalletRiskLabel(actor, {
      address: "0x0000000000000000000000000000000000000001",
      label: "Risk cluster",
      confidence: "LOW"
    })).rejects.toMatchObject({ statusCode: 400 });

    await expect(service.createWalletRiskLabel(actor, {
      address: "0x0000000000000000000000000000000000000001",
      label: "Scammer wallet",
      confidence: "LOW",
      provenanceReference: "internal-review-1"
    })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects import payloads that look like exploit instructions", async () => {
    const service = new ThreatKnowledgeService(fakeRepository() as never);

    await expect(service.importThreatIntel(actor, {
      importReference: "internal-import-1",
      entries: [{
        sourceType: "PUBLIC_REPORT",
        confidence: "LOW",
        title: "Unsafe import",
        summary: "This contains a step-by-step exploit and must be rejected.",
        provenanceReference: "internal-import-1"
      }]
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

function fakeRepository(overrides: Record<string, unknown> = {}) {
  return {
    getThreatSignature: vi.fn(async () => overrides.signature ?? threatSignature({})),
    scanForMatching: vi.fn(async () => ({
      id: "scan-1",
      projectId: "project-1",
      vulnerabilities: [],
      monitorAlerts: [],
      ...(overrides.scan as object | undefined)
    })),
    upsertSignatureMatch: vi.fn(async (input) => ({ id: "match-1", ...input })),
    createRevision: vi.fn(async (input) => ({ id: "revision-1", ...input })),
    createThreatIntel: vi.fn(async (input) => ({ id: "intel-1", ...input })),
    createThreatSource: vi.fn(async (input) => ({ id: "source-1", ...input })),
    createIncidentReference: vi.fn(async (input) => ({ id: "incident-1", ...input })),
    createThreatSignature: vi.fn(async (input) => ({ id: "signature-1", ...input })),
    createThreatSignatureCondition: vi.fn(async (input) => ({ id: "condition-1", ...input })),
    findingForFeedback: vi.fn(async () => null),
    createFalsePositiveFeedback: vi.fn(async (input) => ({ id: "feedback-1", ...input })),
    findingsForPrecision: vi.fn(async () => []),
    upsertPrecisionMetric: vi.fn(async (input) => ({ id: "metric-1", ...input })),
    createWalletRiskLabel: vi.fn(async (input) => ({ id: "wallet-label-1", ...input })),
    createContractRiskLabel: vi.fn(async (input) => ({ id: "contract-label-1", ...input })),
    ...overrides
  };
}

function threatSignature(input: Record<string, unknown>) {
  return {
    id: "signature-1",
    kind: "REENTRANCY",
    name: "Reentrancy defensive signature",
    confidence: "MEDIUM",
    evidenceRequirements: [],
    pattern: null,
    conditions: [],
    ...input
  };
}

function persistedFinding(input: Record<string, unknown> = {}) {
  return {
    id: "finding-1",
    scanId: "scan-1",
    category: "REENTRANCY",
    title: "Reentrancy risk",
    description: "External call before state update",
    externalRuleId: "reentrancy-eth",
    severity: "HIGH",
    confidence: "MEDIUM",
    status: "OPEN",
    evidenceItems: [{ id: "evidence-1" }],
    codeLinks: [],
    aiFindingValidations: [],
    simulationDecisions: [],
    fuzzRuns: [],
    fuzzCounterexamples: [],
    invariantResults: [],
    ...input
  };
}

function precisionFinding(input: {
  reviewStatus?: string;
  feedbackCount?: number;
  aiDecision?: string;
  simulationDecision?: string;
  fuzzStatus?: string;
} = {}) {
  return {
    status: "OPEN",
    review: input.reviewStatus ? { status: input.reviewStatus } : null,
    falsePositiveFeedback: Array.from({ length: input.feedbackCount ?? 0 }, (_, index) => ({ id: `fp-${index}` })),
    aiFindingValidations: input.aiDecision ? [{ decision: input.aiDecision }] : [],
    simulationDecisions: input.simulationDecision ? [{ decision: input.simulationDecision }] : [],
    fuzzRuns: input.fuzzStatus ? [{ status: input.fuzzStatus, invariantStatus: null }] : []
  };
}

function fakeUsage() {
  return { assertAndConsume: vi.fn(async () => undefined) };
}
