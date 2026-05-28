import { describe, expect, it } from "vitest";
import { SolidityFileRegistry } from "../../../packages/analysis-ir/src/source-range.js";

describe("Solidity source range normalization", () => {
  it("converts solc offset:length:fileIndex ranges into line and column coordinates", () => {
    const source = [
      "pragma solidity ^0.8.24;",
      "contract Vault {",
      "  function withdraw() external {}",
      "}"
    ].join("\n");
    const offset = source.indexOf("function withdraw");
    const registry = new SolidityFileRegistry([
      {
        fileIndex: 0,
        filePath: "contracts/Vault.sol",
        content: source
      }
    ]);

    expect(registry.normalizeSolcSrc(`${offset}:17:0`)).toMatchObject({
      status: "EXTRACTED",
      filePath: "contracts/Vault.sol",
      startLine: 3,
      startColumn: 3,
      endLine: 3,
      endColumn: 20
    });
  });
});
