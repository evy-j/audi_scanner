import { ApiError } from "../../../apps/api/src/common/errors/api-error.js";
import { PUBLIC_BETA_DISCLAIMER, ReportsService } from "../../../apps/api/src/modules/reports/reports.service.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ReportsService P6", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SCANNER_ARTIFACT_ROOT = ".artifacts-test";
  });

  it("generates professional reports from persisted scan data only and includes the disclaimer", async () => {
    const harness = createHarness();

    await harness.service.generate("scan-1", actor());

    expect(harness.repository.scanForReport).toHaveBeenCalledWith("scan-1", "org-1", false);
    expect(harness.repository.createReport).toHaveBeenCalledWith(
      expect.objectContaining({
        disclaimer: PUBLIC_BETA_DISCLAIMER,
        sections: expect.arrayContaining([
          expect.objectContaining({ key: "finding-details", body: expect.stringContaining("Evidence IDs: evidence-1") }),
          expect.objectContaining({ key: "disclaimer", body: PUBLIC_BETA_DISCLAIMER })
        ])
      })
    );
  });

  it("keeps suppressed findings hidden by default", async () => {
    const harness = createHarness();

    await harness.service.generate("scan-1", actor());

    expect(harness.repository.scanForReport).toHaveBeenCalledWith("scan-1", "org-1", false);
  });

  it("share token grants public report access until revoked", async () => {
    const harness = createHarness();
    harness.repository.findPublicByShareTokenHash.mockResolvedValue({
      id: "share-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      report: reportRecord()
    });

    const shared = await harness.service.publicReport("share-token");

    expect(shared).toMatchObject({ id: "report-1", disclaimer: PUBLIC_BETA_DISCLAIMER });
    expect(harness.repository.touchShareLink).toHaveBeenCalledWith("share-1");
  });

  it("revoked token blocks public report access", async () => {
    const harness = createHarness();
    harness.repository.findPublicByShareTokenHash.mockResolvedValue({
      id: "share-1",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      report: reportRecord()
    });

    await expect(harness.service.publicReport("share-token")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("audits export events", async () => {
    const harness = createHarness();

    await harness.service.export("report-1", actor(), { format: "JSON", includeSuppressed: false });

    expect(harness.repository.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "REPORT_EXPORT",
        resource: "REPORT_EXPORT"
      })
    );
  });

  it("usage limits block export when exceeded", async () => {
    const harness = createHarness();
    harness.usageLimits.assertAndConsume.mockRejectedValue(ApiError.limitExceeded("Usage limit exceeded"));

    await expect(harness.service.export("report-1", actor(), { format: "JSON", includeSuppressed: false })).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED"
    });
    expect(harness.repository.createExport).not.toHaveBeenCalled();
  });

  it("PDF unavailable does not create a fake PDF export", async () => {
    const harness = createHarness();

    await harness.service.export("report-1", actor(), { format: "PDF", includeSuppressed: false });

    expect(harness.repository.createExport).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "PDF",
        status: "FAILED",
        errorCategory: "PDF_PROVIDER_NOT_CONFIGURED"
      })
    );
  });
});

function createHarness() {
  const repository = {
    list: vi.fn(),
    listByScan: vi.fn(),
    findById: vi.fn(async () => reportRecord()),
    scanForReport: vi.fn(async () => scanRecord()),
    createReport: vi.fn(async (input: any) => ({ id: "report-1", ...input })),
    createExport: vi.fn(async (input: any) => ({ id: "export-1", ...input })),
    createShareLink: vi.fn(async (input: any) => ({ id: "share-1", ...input })),
    revokeShareLinks: vi.fn(async () => ({ count: 1 })),
    findPublicByShareTokenHash: vi.fn(),
    touchShareLink: vi.fn(async () => ({})),
    audit: vi.fn(async () => ({}))
  };
  const usageLimits = {
    assertAndConsume: vi.fn(async () => undefined)
  };
  return {
    service: new ReportsService(repository as never, usageLimits as never),
    repository,
    usageLimits
  };
}

function actor() {
  return { organizationId: "org-1", actorUserId: "user-1" };
}

function reportRecord() {
  return {
    id: "report-1",
    organizationId: "org-1",
    projectId: "project-1",
    scanId: "scan-1",
    reportNumber: "W3G-1",
    status: "SUCCEEDED",
    title: "Report",
    executiveSummary: "Summary",
    riskScore: 42,
    includeSuppressed: false,
    generatedAt: new Date(),
    createdAt: new Date(),
    deletedAt: null,
    sections: [{ id: "section-1", sectionKey: "disclaimer", title: "Disclaimer", body: PUBLIC_BETA_DISCLAIMER, metadata: null }],
    exports: [],
    shareLinks: [],
    disclaimers: [{ id: "disclaimer-1", text: PUBLIC_BETA_DISCLAIMER }],
    generationRuns: []
  };
}

function scanRecord() {
  return {
    id: "scan-1",
    organizationId: "org-1",
    projectId: "project-1",
    title: "Scan",
    status: "COMPLETED",
    riskScore: 42,
    targets: [{ targetType: "SOURCE_ARCHIVE" }],
    analyzerRuns: [{ toolName: "semgrep", status: "COMPLETED" }],
    buildProfiles: [],
    buildRuns: [],
    compilerArtifacts: [],
    testRuns: [],
    analyzerToolAvailability: [],
    analysisIrRuns: [],
    contractSymbols: [],
    functionSymbols: [],
    externalCallSites: [],
    storageLayoutEntries: [],
    vulnerabilities: [
      {
        id: "finding-1",
        title: "External call",
        description: "External call before state update",
        severity: "HIGH",
        confidenceState: "SUPPORTED",
        status: "OPEN",
        filePath: "contracts/Vault.sol",
        lineStart: 10,
        lineEnd: 12,
        review: { status: "ACCEPTED" },
        evidenceItems: [
          {
            id: "evidence-1",
            message: "External call before state update",
            filePath: "contracts/Vault.sol",
            startLine: 10,
            endLine: 12,
            analyzerRun: { toolName: "semgrep" }
          }
        ],
        codeLinks: [],
        aiFindingValidations: [{ decision: "EVIDENCE_MEDIUM", aiValidationRun: { status: "SUCCEEDED" } }],
        remediationRuns: [{ status: "SUCCEEDED", suggestions: [{ title: "Move state update" }] }]
      }
    ]
  };
}
