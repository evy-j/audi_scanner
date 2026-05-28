import { describe, expect, it } from "vitest";
import { REAL_TRUST_OPERATION_TEMPLATES, getRealTrustOperationTemplate } from "@audit-scanner/shared";

describe("real trust operations", () => {
  it("tracks the real-world trust inputs that cannot be fabricated", () => {
    expect(REAL_TRUST_OPERATION_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    const customer = getRealTrustOperationTemplate("customer-pilots");
    expect(customer?.requiredEvidence).toContain("real organization");
    expect(customer?.blockedClaims).toContain("customer logo");
  });

  it("keeps public and certification-like claims blocked until evidence exists", () => {
    const publicRecord = getRealTrustOperationTemplate("public-track-record");
    expect(publicRecord?.claimPolicy).toBe("CONSENT_REQUIRED");
    expect(publicRecord?.blockedClaims.join(" ")).toMatch(/certified audit/i);
  });
});
