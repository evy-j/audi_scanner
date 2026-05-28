import { describe, expect, it } from "vitest";
import { safeMonitoringStatusMessage } from "../../apps/web/src/lib/monitoring-status";

describe("frontend monitoring status mapping", () => {
  it("maps monitoring error states safely", () => {
    expect(safeMonitoringStatusMessage("DISABLED")).toBe("Monitoring Disabled");
    expect(safeMonitoringStatusMessage("RPC_NOT_CONFIGURED")).toBe("RPC Not Configured");
    expect(safeMonitoringStatusMessage("NOT_ASSESSED")).toBe("Not Assessed");
    expect(safeMonitoringStatusMessage("REORGED")).toBe("Reorged");
    expect(safeMonitoringStatusMessage("PROVIDER_ERROR")).toBe("Provider Error");
  });
});
