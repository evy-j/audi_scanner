import { describe, expect, it } from "vitest";
import { SCAN_QUEUE_NAMES } from "../../packages/shared/src/queues/scan-jobs.js";

describe("scan queue lifecycle contract", () => {
  it("keeps the enterprise scan queue chain stable", () => {
    expect(Object.values(SCAN_QUEUE_NAMES)).toEqual([
      "scan.orchestrator",
      "source.prepare",
      "build.compile",
      "analyzer.slither",
      "analyzer.mythril",
      "analyzer.semgrep",
      "analyzer.aderyn",
      "analyzer.foundry",
      "findings.normalize",
      "risk.score",
      "ai.validate",
      "ai.report",
      "pdf.generate",
      "notifications.dispatch"
    ]);
  });
});
