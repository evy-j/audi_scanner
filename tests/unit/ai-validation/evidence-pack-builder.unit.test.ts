import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  prisma: {
    vulnerability: { findFirst: vi.fn() },
    scan: { findFirst: vi.fn() }
  }
}));

vi.mock("@audit-scanner/database", () => ({
  prisma: db.prisma
}));

describe("AiEvidencePackBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds finding packs from persisted evidence rows only", async () => {
    db.prisma.vulnerability.findFirst.mockResolvedValue(findingRecord());
    const { AiEvidencePackBuilder } = await import(
      "../../../apps/worker/src/services/ai-validation/evidence-pack-builder.js"
    );

    const pack = await new AiEvidencePackBuilder().buildFindingPack("finding-1", "org-1");

    expect(pack?.p1Evidence).toHaveLength(1);
    expect(pack?.p1Evidence[0]?.id).toBe("evidence-1");
    expect(pack?.p1Evidence[0]?.snippet).toContain("[REDACTED_HEX_SECRET]");
    expect(JSON.stringify(pack)).not.toContain("unrelated-file");
    expect(db.prisma.vulnerability.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "finding-1",
          scan: expect.objectContaining({ organizationId: "org-1" })
        })
      })
    );
  });
});

function findingRecord() {
  const createdAt = new Date("2026-05-24T00:00:00.000Z");
  return {
    id: "finding-1",
    title: "External call",
    description: "Persisted analyzer message",
    severity: "HIGH",
    confidence: "MEDIUM",
    confidenceState: "SUPPORTED",
    status: "OPEN",
    analyzer: "SLITHER",
    externalRuleId: "reentrancy",
    category: "REENTRANCY",
    filePath: "contracts/Vault.sol",
    lineStart: 10,
    lineEnd: 11,
    severityScore: 80,
    confidenceScore: 70,
    exploitabilityScore: 60,
    priorityScore: 90,
    evidenceQuality: 85,
    scan: {
      id: "scan-1",
      organizationId: "org-1",
      projectId: "project-1",
      status: "COMPLETED",
      title: "Scan",
      riskScore: 42,
      analyzerRuns: [],
      analysisIrRuns: [],
      buildProfiles: [],
      buildRuns: [{ id: "build-1", toolKind: "UNKNOWN", command: "", status: "NOT_ASSESSED", exitCode: null, artifactPath: null, artifactChecksumSha256: null, errorCategory: null, error: null }],
      compilerArtifacts: [],
      testRuns: [],
      analyzerToolAvailability: []
    },
    evidenceItems: [
      {
        id: "evidence-1",
        evidenceType: "ANALYZER",
        ruleId: "reentrancy",
        detectorName: "Slither",
        message: "External call before state update",
        filePath: "contracts/Vault.sol",
        startLine: 10,
        endLine: 11,
        startColumn: 1,
        endColumn: 4,
        snippet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        analyzerRunId: "run-1",
        rawArtifactPath: "slither.json",
        rawArtifactChecksum: "sha",
        analyzerEvidence: { id: "analyzer-evidence-1" },
        analyzerRun: null,
        sourceRange: null
      }
    ],
    sourceRanges: [],
    detectorMetadata: [],
    review: {
      status: "UNREVIEWED",
      suppressionRuleId: null,
      comments: [],
      events: []
    },
    codeLinks: [],
    createdAt
  };
}
