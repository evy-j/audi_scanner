import { describe, expect, it } from "vitest";
import { SCAN_QUEUE_NAMES } from "../../packages/shared/src/queues/scan-jobs.js";

describe("worker queue contract", () => {
  it("routes each scan stage to an owned worker queue", () => {
    expect(SCAN_QUEUE_NAMES.scanOrchestrator).toBe("scan.orchestrator");
    expect(SCAN_QUEUE_NAMES.sourcePrepare).toBe("source.prepare");
    expect(SCAN_QUEUE_NAMES.buildCompile).toBe("build.compile");
    expect(SCAN_QUEUE_NAMES.analyzerAderyn).toBe("analyzer.aderyn");
    expect(SCAN_QUEUE_NAMES.findingsNormalize).toBe("findings.normalize");
    expect(SCAN_QUEUE_NAMES.riskScore).toBe("risk.score");
    expect(SCAN_QUEUE_NAMES.aiValidate).toBe("ai.validate");
    expect(SCAN_QUEUE_NAMES.aiReport).toBe("ai.report");
    expect(SCAN_QUEUE_NAMES.pdfGenerate).toBe("pdf.generate");
    expect(SCAN_QUEUE_NAMES.notificationsDispatch).toBe("notifications.dispatch");
  });
});
