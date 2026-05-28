import { describe, expect, it } from "vitest";
import { getScanEventChannel } from "../../../packages/shared/src/queues/scan-events.js";

describe("scan event channels", () => {
  it("uses a scan-scoped Redis pub/sub channel", () => {
    expect(getScanEventChannel("scan-123")).toBe("scan-events:scan-123");
  });
});
