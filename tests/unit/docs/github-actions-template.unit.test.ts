import { promises as fs } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P12 GitHub Actions template", () => {
  it("documents required Web3Guard secrets and SARIF upload", async () => {
    const template = await fs.readFile("docs/templates/web3guard.yml", "utf8");

    expect(template).toContain("WEB3GUARD_API_URL");
    expect(template).toContain("WEB3GUARD_API_KEY");
    expect(template).toContain("github/codeql-action/upload-sarif");
    expect(template).toContain("web3guard.sarif");
  });
});
