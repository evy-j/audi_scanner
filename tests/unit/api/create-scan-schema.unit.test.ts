import { describe, expect, it } from "vitest";
import { createScanSchema } from "../../../apps/api/src/modules/scans/scans.schemas.js";

const organizationId = "00000000-0000-4000-8000-000000000001";

describe("createScanSchema", () => {
  it("accepts source artifact scans", () => {
    const parsed = createScanSchema.parse({
      organizationId,
      title: "Fixture scan",
      target: {
        type: "SOURCE",
        artifactKey: "source-fixtures/reentrancy-bank"
      },
      analyzers: ["semgrep"]
    });

    expect(parsed.priority).toBe("NORMAL");
    expect(parsed.target.artifactKey).toBe("source-fixtures/reentrancy-bank");
  });

  it("rejects address scans without chain context", () => {
    const parsed = createScanSchema.safeParse({
      organizationId,
      target: {
        type: "ADDRESS",
        address: "0x0000000000000000000000000000000000000000"
      },
      analyzers: ["slither"]
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".") === "chainId")).toBe(true);
  });

  it("accepts source scans from stored source artifact ids", () => {
    const parsed = createScanSchema.parse({
      organizationId,
      sourceArtifactId: "00000000-0000-4000-8000-000000000002",
      target: {
        type: "SOURCE"
      },
      analyzers: ["semgrep"]
    });

    expect(parsed.sourceArtifactId).toBe("00000000-0000-4000-8000-000000000002");
  });

  it("rejects source scans without an artifact key or source artifact id", () => {
    const parsed = createScanSchema.safeParse({
      organizationId,
      target: {
        type: "SOURCE"
      },
      analyzers: ["semgrep"]
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.some((issue) => issue.path.join(".") === "sourceArtifactId")).toBe(true);
  });
});
