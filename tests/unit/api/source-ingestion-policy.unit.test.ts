import { describe, expect, it } from "vitest";
import { evaluateSourceFiles } from "../../../apps/api/src/modules/source-ingestion/source-policy";

describe("P12B source ingestion policy", () => {
  it("excludes .env and node_modules from accepted source files", () => {
    const result = evaluateSourceFiles([
      { path: "contracts/Vault.sol", content: Buffer.from("pragma solidity ^0.8.20; contract Vault {}\n") },
      { path: ".env", content: Buffer.from("PRIVATE_KEY=abc") },
      { path: "node_modules/lib/index.js", content: Buffer.from("module.exports = {}") }
    ]);

    expect(result.files.map((file) => file.path)).toEqual(["contracts/Vault.sol"]);
    expect(result.ignored.map((file) => file.path)).toContain(".env");
    expect(result.ignored.map((file) => file.path)).toContain("node_modules/lib/index.js");
  });

  it("respects .web3guardignore rules", () => {
    const result = evaluateSourceFiles([
      { path: ".web3guardignore", content: Buffer.from("ignored/\n") },
      { path: "contracts/Keep.sol", content: Buffer.from("pragma solidity ^0.8.20; contract Keep {}\n") },
      { path: "ignored/Drop.sol", content: Buffer.from("pragma solidity ^0.8.20; contract Drop {}\n") }
    ]);

    expect(result.files.map((file) => file.path)).toContain("contracts/Keep.sol");
    expect(result.ignored.map((file) => file.path)).toContain("ignored/Drop.sol");
  });

  it("rejects high-risk secret files without storing raw secret text", () => {
    const result = evaluateSourceFiles([
      { path: "contracts/Key.sol", content: Buffer.from("const token = 'ghp_123456789012345678901234567890123456';") }
    ]);

    expect(result.files).toHaveLength(0);
    expect(result.rejected[0]).toMatchObject({ reason: "secret_detected", category: "GITHUB_TOKEN" });
    expect(JSON.stringify(result.manifest)).not.toContain("ghp_1234567890");
  });
});
