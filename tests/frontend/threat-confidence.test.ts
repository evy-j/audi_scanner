import { describe, expect, it } from "vitest";
import { safeThreatConfidenceLabel, safeThreatMatchLabel, threatConfidenceBadgeVariant } from "../../apps/web/src/lib/threat-confidence";

describe("frontend threat confidence mapping", () => {
  it("maps threat confidence safely", () => {
    expect(safeThreatConfidenceLabel("LOW")).toBe("LOW");
    expect(safeThreatConfidenceLabel("MEDIUM")).toBe("MEDIUM");
    expect(safeThreatConfidenceLabel("HIGH")).toBe("HIGH");
    expect(safeThreatConfidenceLabel("VERIFIED")).toBe("VERIFIED");
    expect(safeThreatConfidenceLabel("DISPUTED")).toBe("DISPUTED");
    expect(safeThreatConfidenceLabel("untrusted")).toBe("LOW");
  });

  it("maps threat confidence to bounded badge variants", () => {
    expect(threatConfidenceBadgeVariant("DISPUTED")).toBe("red");
    expect(threatConfidenceBadgeVariant("MEDIUM")).toBe("amber");
    expect(threatConfidenceBadgeVariant("VERIFIED")).toBe("default");
    expect(threatConfidenceBadgeVariant("unexpected")).toBe("neutral");
  });

  it("maps match states safely", () => {
    expect(safeThreatMatchLabel("MATCHED")).toBe("MATCHED");
    expect(safeThreatMatchLabel("INCONCLUSIVE")).toBe("INCONCLUSIVE");
    expect(safeThreatMatchLabel("invented")).toBe("NOT_ASSESSED");
  });
});
