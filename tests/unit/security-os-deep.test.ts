
import { describe, expect, it } from "vitest";
import { SECURITY_OS_ARTIFACT_TYPES, SECURITY_OS_DEEP_PHASES, getSecurityOsDeepPhase, getSecurityOsDeepProgress, isSecurityOsArtifactType } from "@audit-scanner/shared";

describe("Security OS P15-P25 deep phase catalog", () => {
  it("tracks all deep phases from P15 to P25 plus operations", () => {
    expect(SECURITY_OS_DEEP_PHASES.map((phase) => phase.id)).toEqual([
      "P15", "P16", "P17", "P18", "P19", "P20", "P21", "P22", "P23", "P24", "P25", "P25_PLUS"
    ]);
  });

  it("does not describe fake completions or certification claims", () => {
    for (const phase of SECURITY_OS_DEEP_PHASES) {
      expect(phase.safetyBoundaries.join(" ")).toContain("No fabricated");
      expect(phase.objective.toLowerCase()).not.toContain("certified audit complete");
    }
  });

  it("maps every capability to a known persisted artifact type", () => {
    for (const phase of SECURITY_OS_DEEP_PHASES) {
      for (const capability of phase.capabilities) {
        expect(isSecurityOsArtifactType(capability.artifactType)).toBe(true);
        expect(SECURITY_OS_ARTIFACT_TYPES).toContain(capability.artifactType);
      }
    }
  });

  it("returns progress with a company-level reality note", () => {
    const progress = getSecurityOsDeepProgress();
    expect(progress.phases).toBe(12);
    expect(progress.capabilities).toBeGreaterThan(20);
    expect(progress.certikLevelReality.toLowerCase()).toContain("human auditors");
  });

  it("resolves phases case-insensitively", () => {
    expect(getSecurityOsDeepPhase("p15")?.id).toBe("P15");
    expect(getSecurityOsDeepPhase("P25_PLUS")?.id).toBe("P25_PLUS");
  });
});
