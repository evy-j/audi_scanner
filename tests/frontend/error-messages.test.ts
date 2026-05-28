import { describe, expect, it } from "vitest";
import { safeErrorMessage, safeFuzzStatusMessage, safeSimulationStatusMessage } from "../../apps/web/src/lib/error-messages";

describe("frontend safe error messages", () => {
  it("maps known API error codes to user-safe messages", () => {
    expect(safeErrorMessage({ code: "LIMIT_EXCEEDED", message: "raw quota internals" })).toBe(
      "This workspace has reached its current beta usage limit."
    );
    expect(safeErrorMessage({ code: "RATE_LIMITED" })).toBe(
      "Too many requests. Please wait briefly and try again."
    );
    expect(safeErrorMessage({ code: "CONFIGURATION_ERROR", message: "stack\n    at internal" })).toBe(
      "The service is missing required deployment configuration."
    );
  });

  it("maps simulation statuses to safe messages", () => {
    expect(safeSimulationStatusMessage("INCONCLUSIVE")).toBe(
      "The local run did not have enough proof to make a determination."
    );
    expect(safeSimulationStatusMessage("NOT_REPRODUCED")).toBe(
      "Local simulation completed without observing the expected condition."
    );
  });

  it("maps fuzz statuses to safe messages", () => {
    expect(safeFuzzStatusMessage("TOOL_NOT_INSTALLED")).toBe(
      "The required scanner tool is not installed in this environment."
    );
    expect(safeFuzzStatusMessage("FAILED")).toBe(
      "Local fuzzing or invariant checks failed and require human review."
    );
  });
});
