import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiValidationProvider } from "../../../apps/worker/src/services/ai-validation/provider.js";
import type { FindingEvidencePack } from "../../../apps/worker/src/services/ai-validation/evidence-pack-builder.js";

const db = vi.hoisted(() => ({
  prisma: {
    scan: { findFirst: vi.fn() },
    vulnerability: { update: vi.fn() },
    aiValidationRun: { create: vi.fn(), update: vi.fn() },
    aiFindingValidation: { create: vi.fn() },
    aiEvidenceCritique: { create: vi.fn() },
    aiReviewNote: { create: vi.fn() },
    aiProviderUsage: { create: vi.fn() }
  }
}));

vi.mock("@audit-scanner/database", () => ({
  prisma: db.prisma
}));

describe("LocalAiValidationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.prisma.aiValidationRun.create.mockResolvedValue({ id: "ai-run-1" });
    db.prisma.aiValidationRun.update.mockResolvedValue({});
    db.prisma.aiFindingValidation.create.mockResolvedValue({ id: "ai-finding-validation-1" });
    db.prisma.aiEvidenceCritique.create.mockResolvedValue({});
    db.prisma.aiReviewNote.create.mockResolvedValue({});
    db.prisma.aiProviderUsage.create.mockResolvedValue({});
  });

  it("persists AI finding validation separately without changing the original finding", async () => {
    const { LocalAiValidationService } = await import(
      "../../../apps/worker/src/services/ai-validation/local-ai-validation.service.js"
    );
    const service = new LocalAiValidationService(
      artifactStoreMock() as never,
      { buildFindingPack: vi.fn(async () => findingPack()) } as never,
      providerMock()
    );

    const result = await service.validate({
      scanId: "scan-1",
      organizationId: "org-1",
      traceId: "trace",
      priority: "NORMAL",
      scope: "FINDING",
      findingId: "finding-1"
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(db.prisma.aiFindingValidation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          findingId: "finding-1",
          decision: "EVIDENCE_WEAK",
          falsePositiveRisk: 35
        })
      })
    );
    expect(db.prisma.aiEvidenceCritique.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          findingEvidenceId: "evidence-1",
          supportLevel: "WEAK"
        })
      })
    );
    expect(db.prisma.vulnerability.update).not.toHaveBeenCalled();
  });
});

function artifactStoreMock() {
  return {
    writeJsonArtifact: vi.fn(async (_prefix: string, relativePath: string) => `ai/${relativePath}`),
    getArtifactMetadata: vi.fn(async () => ({ sha256: "sha256", sizeBytes: 100 }))
  };
}

function providerMock(): AiValidationProvider {
  return {
    providerName: "LOCAL",
    model: "deterministic",
    isConfigured: () => true,
    generateJson: vi.fn(async () => ({
      rawText: "{}",
      json: {
        decision: "EVIDENCE_WEAK",
        reasoningSummary: "The evidence references a call but lacks state-order proof.",
        evidenceIdsUsed: ["evidence-1"],
        missingEvidence: ["state update ordering"],
        falsePositiveRisk: 35,
        evidenceCoverageScore: 45,
        hallucinationRisk: 5,
        humanReviewerChecklist: ["Review the linked function source range."],
        evidenceCritiques: [
          {
            evidenceId: "evidence-1",
            supportLevel: "WEAK",
            critique: "The evidence is relevant but incomplete."
          }
        ]
      },
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
    }))
  };
}

function findingPack(): FindingEvidencePack {
  return {
    version: "p4-ai-evidence-pack/v1",
    scope: "FINDING",
    scan: {
      id: "scan-1",
      organizationId: "org-1",
      projectId: "project-1",
      status: "COMPLETED",
      title: "Scan",
      riskScore: 1,
      analyzerRuns: [],
      analysisIrRuns: []
    },
    finding: {
      id: "finding-1",
      title: "External call",
      description: "Analyzer evidence exists",
      severity: "HIGH",
      confidence: "MEDIUM",
      confidenceState: "SUPPORTED",
      status: "OPEN",
      analyzer: "SLITHER",
      detectorRuleId: "reentrancy",
      category: "REENTRANCY",
      location: { filePath: "Vault.sol", startLine: 1, endLine: 1, startColumn: null, endColumn: null },
      scores: { severity: 80, confidence: 60, exploitability: 50, priority: 70, evidenceQuality: 40 }
    },
    p1Evidence: [
      {
        id: "evidence-1",
        evidenceType: "ANALYZER",
        ruleId: "reentrancy",
        detectorName: "Slither",
        message: "call before update",
        location: { filePath: "Vault.sol", startLine: 1, endLine: 1, startColumn: null, endColumn: null },
        snippet: "target.call(\"\");",
        analyzerRunId: "run-1",
        analyzerEvidenceId: "analyzer-evidence-1",
        rawArtifactPath: "slither.json",
        rawArtifactChecksum: "sha"
      }
    ],
    sourceRanges: [],
    detectorMetadata: [],
    p2aReview: { status: "UNREVIEWED", suppressionRuleId: null, comments: [], events: [] },
    p2bCodeLinks: [],
    p3Context: {
      buildProfiles: [],
      buildRuns: [],
      compilerArtifacts: [],
      testRuns: [],
      toolAvailability: []
    }
  };
}
