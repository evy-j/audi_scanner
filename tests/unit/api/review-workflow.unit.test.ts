import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewRepository } from "../../../apps/api/src/modules/review/review.repository.js";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  projectId: "00000000-0000-4000-8000-000000000002",
  scanId: "00000000-0000-4000-8000-000000000003",
  baseScanId: "00000000-0000-4000-8000-000000000004",
  findingId: "00000000-0000-4000-8000-000000000005",
  ruleId: "00000000-0000-4000-8000-000000000006",
  reviewId: "00000000-0000-4000-8000-000000000007"
};

const db = vi.hoisted(() => {
  const tx = {
    findingReview: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn()
    },
    vulnerability: {
      update: vi.fn(),
      findMany: vi.fn()
    },
    findingReviewEvent: {
      create: vi.fn()
    },
    findingSuppressionRule: {
      create: vi.fn()
    },
    codeOwnerRule: {
      create: vi.fn()
    },
    findingAssignment: {
      create: vi.fn()
    }
  };

  return {
    tx,
    prisma: {
      vulnerability: {
        findFirst: vi.fn()
      },
      project: {
        findFirst: vi.fn()
      },
      scan: {
        findFirst: vi.fn()
      },
      findingBaseline: {
        upsert: vi.fn()
      },
      findingReviewEvent: {
        create: vi.fn()
      },
      $transaction: vi.fn(async (input: unknown) => {
        if (typeof input === "function") {
          return input(tx);
        }
        if (Array.isArray(input)) {
          return Promise.all(input);
        }
        return input;
      })
    }
  };
});

vi.mock("../../../apps/api/src/infra/prisma/prisma.js", () => ({
  prisma: db.prisma
}));

describe("ReviewRepository workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.prisma.project.findFirst.mockResolvedValue({ id: ids.projectId, organizationId: ids.organizationId });
    db.prisma.vulnerability.findFirst.mockResolvedValue(finding("fp-current"));
    db.tx.findingReview.findUnique.mockResolvedValue(null);
    db.tx.findingReview.upsert.mockResolvedValue(review("UNREVIEWED"));
    db.tx.findingReview.update.mockResolvedValue(review("UNREVIEWED"));
    db.tx.vulnerability.update.mockResolvedValue({});
    db.tx.findingReviewEvent.create.mockResolvedValue({});
    db.tx.findingSuppressionRule.create.mockResolvedValue({
      id: ids.ruleId,
      projectId: ids.projectId,
      reason: "Known duplicate"
    });
    db.tx.findingAssignment.create.mockResolvedValue({ id: "assignment-id" });
    db.tx.codeOwnerRule.create.mockResolvedValue({ id: ids.ruleId, pathPattern: "contracts/**/*.sol" });
    db.prisma.findingBaseline.upsert.mockResolvedValue({});
    db.prisma.findingReviewEvent.create.mockResolvedValue({});
  });

  it("persists review status changes with an audit event", async () => {
    db.tx.findingReview.findUnique.mockResolvedValue(review("UNREVIEWED"));
    db.tx.findingReview.upsert.mockResolvedValue(review("ACCEPTED"));

    const result = await new ReviewRepository().changeStatus(ids.findingId, actor(), {
      status: "ACCEPTED",
      reason: "Valid issue"
    });

    expect(result?.status).toBe("ACCEPTED");
    expect(db.tx.vulnerability.update).toHaveBeenCalledWith({
      where: { id: ids.findingId },
      data: { status: "OPEN" }
    });
    expect(db.tx.findingReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "STATUS_CHANGED",
          findingId: ids.findingId,
          previousValue: { status: "UNREVIEWED", severityOverride: null, confidenceOverride: null },
          newValue: { status: "ACCEPTED", severityOverride: null, confidenceOverride: null },
          reason: "Valid issue"
        })
      })
    );
  });

  it("suppression rules mark matching findings suppressed without deleting them", async () => {
    db.tx.vulnerability.findMany.mockResolvedValue([finding("fp-current")]);
    db.tx.findingReview.upsert.mockResolvedValue(review("SUPPRESSED"));

    const result = await new ReviewRepository().createSuppressionRule(ids.projectId, actor(), {
      analyzerName: "semgrep",
      ruleId: "solidity.reentrancy",
      reason: "Accepted duplicate signature"
    });

    expect(result?.matchedFindingCount).toBe(1);
    expect(db.tx.vulnerability.update).toHaveBeenCalledWith({
      where: { id: ids.findingId },
      data: { status: "SUPPRESSED" }
    });
    expect(db.tx.findingReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "SUPPRESSED",
          findingId: ids.findingId,
          newValue: { status: "SUPPRESSED", suppressionRuleId: ids.ruleId }
        })
      })
    );
  });

  it("unsuppression restores the previous review state", async () => {
    db.tx.findingReview.findUnique.mockResolvedValue({
      ...review("SUPPRESSED"),
      statusBeforeSuppression: "ACCEPTED"
    });
    db.tx.findingReview.upsert.mockResolvedValue(review("ACCEPTED"));

    const result = await new ReviewRepository().unsuppressFinding(ids.findingId, actor(), {
      reason: "Needs active review"
    });

    expect(result?.status).toBe("ACCEPTED");
    expect(db.tx.vulnerability.update).toHaveBeenCalledWith({
      where: { id: ids.findingId },
      data: { status: "OPEN" }
    });
    expect(db.tx.findingReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UNSUPPRESSED",
          previousValue: { status: "SUPPRESSED" },
          newValue: { status: "ACCEPTED" }
        })
      })
    );
  });

  it("baseline comparison detects new, existing, fixed, and regressed findings", async () => {
    const current = finding("fp-current");
    const existing = finding("fp-existing", "current-existing");
    const regressed = finding("fp-regressed", "current-regressed");
    const baseExisting = finding("fp-existing", "base-existing");
    const baseRegressed = {
      ...finding("fp-regressed", "base-regressed"),
      review: review("FIXED"),
      status: "FIXED"
    };
    const fixed = finding("fp-fixed", "base-fixed");
    db.prisma.scan.findFirst
      .mockResolvedValueOnce({
        id: ids.scanId,
        organizationId: ids.organizationId,
        projectId: ids.projectId,
        createdAt: new Date("2026-05-23T10:00:00.000Z"),
        vulnerabilities: [current, existing, regressed]
      })
      .mockResolvedValueOnce({
        id: ids.baseScanId,
        organizationId: ids.organizationId,
        projectId: ids.projectId,
        vulnerabilities: [baseExisting, baseRegressed, fixed]
      });

    const comparison = await new ReviewRepository().compareBaseline(
      ids.scanId,
      ids.organizationId,
      ids.baseScanId
    );

    expect(comparison?.newFindings.map((item) => item.fingerprint)).toEqual(["fp-current"]);
    expect(comparison?.existingFindings.map((item) => item.fingerprint).sort()).toEqual([
      "fp-existing",
      "fp-regressed"
    ]);
    expect(comparison?.fixedFindings.map((item) => item.fingerprint)).toEqual(["fp-fixed"]);
    expect(comparison?.regressedFindings.map((item) => item.fingerprint)).toEqual(["fp-regressed"]);
    expect(db.prisma.findingBaseline.upsert).toHaveBeenCalled();
  });

  it("SARIF export contains persisted finding source ranges", async () => {
    db.prisma.scan.findFirst.mockResolvedValue({
      id: ids.scanId,
      organizationId: ids.organizationId,
      projectId: ids.projectId,
      vulnerabilities: [
        {
          ...finding("fp-current"),
          evidenceItems: [
            {
              analyzerRun: { toolName: "semgrep" },
              ruleId: "solidity.reentrancy",
              message: "External call before state update",
              filePath: "contracts/Vault.sol",
              startLine: 42,
              endLine: 44,
              startColumn: 7,
              endColumn: 12
            }
          ]
        }
      ]
    });

    const sarif = await new ReviewRepository().exportSarif(ids.scanId, ids.organizationId, true);

    expect(sarif?.version).toBe("2.1.0");
    expect(sarif?.runs[0]?.results[0]).toMatchObject({
      ruleId: "solidity.reentrancy",
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: "contracts/Vault.sol" },
            region: { startLine: 42, endLine: 44, startColumn: 7, endColumn: 12 }
          }
        }
      ]
    });
  });

  it("code owner rules assign matching findings", async () => {
    db.tx.vulnerability.findMany.mockResolvedValue([
      {
        ...finding("fp-current"),
        filePath: "contracts/Vault.sol"
      }
    ]);

    const result = await new ReviewRepository().createCodeOwnerRule(ids.projectId, actor(), {
      pathPattern: "contracts/*.sol",
      ownerEmail: "security@example.com",
      severityThreshold: "MEDIUM"
    });

    expect(result?.matchedFindingCount).toBe(1);
    expect(db.tx.findingAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          findingId: ids.findingId,
          assigneeEmail: "security@example.com"
        })
      })
    );
    expect(db.tx.findingReviewEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "ASSIGNED" })
      })
    );
  });
});

function actor() {
  return {
    organizationId: ids.organizationId,
    actorUserId: "00000000-0000-4000-8000-000000000099"
  };
}

function review(status: string) {
  return {
    id: ids.reviewId,
    organizationId: ids.organizationId,
    projectId: ids.projectId,
    scanId: ids.scanId,
    findingId: ids.findingId,
    status,
    statusBeforeSuppression: null,
    severityOverride: null,
    confidenceOverride: null,
    suppressionRuleId: null,
    assignedToName: null,
    assignedToEmail: null,
    assignedToTeam: null
  };
}

function finding(fingerprint: string, id = ids.findingId) {
  return {
    id,
    scanId: ids.scanId,
    contractId: null,
    analyzer: "SEMGREP",
    externalRuleId: "solidity.reentrancy",
    fingerprint,
    category: "REENTRANCY",
    title: "External call before state update",
    description: "External call before state update",
    severity: "HIGH",
    confidence: "HIGH",
    confidenceState: "SUPPORTED",
    status: "OPEN",
    severityScore: 75,
    confidenceScore: 89,
    exploitabilityScore: 67,
    priorityScore: 77,
    evidenceQuality: 90,
    filePath: "contracts/Vault.sol",
    contractName: "Vault",
    functionName: "withdraw",
    lineStart: 42,
    lineEnd: 44,
    evidence: null,
    remediation: null,
    referenceUrls: [],
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    scan: {
      id: ids.scanId,
      organizationId: ids.organizationId,
      projectId: ids.projectId
    },
    review: null
  };
}
