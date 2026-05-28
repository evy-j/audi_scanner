import { describe, expect, it } from "vitest";
import { getSecurityOsPhase, listSecurityOsPhases } from "@audit-scanner/shared";

describe("P14-P25 security OS roadmap", () => {
  it("tracks P14 through P25+ without claiming completion", () => {
    const phases = listSecurityOsPhases();
    expect(phases.map((phase) => phase.id)).toContain("P14");
    expect(phases.map((phase) => phase.id)).toContain("P25_PLUS");
    expect(phases.every((phase) => phase.status === "SCAFFOLD_READY")).toBe(true);
  });

  it("returns a specific phase contract", () => {
    const phase = getSecurityOsPhase("p15");
    expect(phase?.title).toContain("Formal verification");
    expect(phase?.safetyBoundaries.join(" ")).toContain("No fabricated");
  });
});
