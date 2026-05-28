import { describe, expect, it, vi } from "vitest";
import { VulnerabilityNormalizationService } from "../../../packages/scanner-core/src/normalization/vulnerability-normalization.service.js";

const db = vi.hoisted(() => {
  const tx = {
    vulnerability: {
      upsert: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000303" }))
    },
    detectorMetadata: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({ id: "detector-metadata-id" }))
    },
    findingEvidence: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000404" }))
    },
    sourceRange: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000505" }))
    },
    findingDecision: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({ id: "finding-decision-id" }))
    },
    analyzerEvidence: {
      create: vi.fn(async () => ({ id: "analyzer-evidence-id" }))
    },
    traceEvidence: {
      create: vi.fn(async () => ({ id: "trace-evidence-id" }))
    }
  };

  return {
    tx,
    prisma: {
      analyzerRun: {
        findMany: vi.fn()
      },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) =>
        callback(tx)
      )
    }
  };
});

vi.mock("@audit-scanner/database", () => ({
  prisma: db.prisma
}));

describe("ScanPersistenceService evidence persistence", () => {
  it("persists normalized findings with source range, analyzer evidence, detector metadata, and decision rows", async () => {
    db.prisma.analyzerRun.findMany.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000606",
        analyzer: "SEMGREP",
        rawArtifactChecksumSha256: "sha256-semgrep-artifact",
        metadata: {
          preparedArtifactKey: "prepared/scan-1"
        },
        startedAt: new Date("2026-05-23T00:00:00.000Z")
      }
    ]);

    const artifactStore = {
      readTextByArtifactKey: vi.fn(async () =>
        [
          "contract Vault {",
          "  mapping(address => uint256) balances;",
          "  function withdraw(uint256 amount) external {",
          "    (bool ok,) = msg.sender.call{value: amount}(\"\");",
          "    require(ok);",
          "  }",
          "}"
        ].join("\n")
      )
    };
    const { ScanPersistenceService } = await import(
      "../../../apps/worker/src/persistence/scan-persistence.service.js"
    );
    const normalized = new VulnerabilityNormalizationService().normalize({
      scanId: "00000000-0000-4000-8000-000000000111",
      organizationId: "00000000-0000-4000-8000-000000000222",
      analyzers: [
        {
          analyzer: "semgrep",
          analyzerVersion: "1.2.3",
          artifactKey: "scanner-runs/scan-1/semgrep/run/semgrep.json",
          rawOutput: {
            results: [
              {
                check_id: "solidity.reentrancy.external-call",
                path: "contracts/Vault.sol",
                start: { line: 3, col: 3 },
                end: { line: 5, col: 17 },
                extra: {
                  message: "External call before state update",
                  metadata: {
                    severity: "HIGH",
                    confidence: "HIGH"
                  }
                }
              }
            ]
          }
        }
      ]
    });

    const count = await new ScanPersistenceService(artifactStore as never).persistNormalizedVulnerabilities(
      normalized
    );

    expect(count).toBe(1);
    expect(db.tx.vulnerability.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          confidenceState: "SUPPORTED",
          severityScore: 75,
          scanId: "00000000-0000-4000-8000-000000000111"
        })
      })
    );
    expect(db.tx.sourceRange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          findingId: "00000000-0000-4000-8000-000000000303",
          filePath: "contracts/Vault.sol",
          startLine: 3,
          endLine: 5
        })
      })
    );
    expect(db.tx.findingEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          findingId: "00000000-0000-4000-8000-000000000303",
          analyzerRunId: "00000000-0000-4000-8000-000000000606",
          evidenceType: "ANALYZER",
          filePath: "contracts/Vault.sol",
          rawArtifactPath: "scanner-runs/scan-1/semgrep/run/semgrep.json",
          rawArtifactChecksum: "sha256-semgrep-artifact"
        })
      })
    );
    expect(db.tx.analyzerEvidence.create).toHaveBeenCalledOnce();
    expect(db.tx.detectorMetadata.create).toHaveBeenCalledOnce();
    expect(db.tx.findingDecision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          findingId: "00000000-0000-4000-8000-000000000303",
          state: "SUPPORTED",
          decidedBy: "deterministic-scoring/v1"
        })
      })
    );
  });
});
