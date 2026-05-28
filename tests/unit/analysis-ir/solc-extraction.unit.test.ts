import { describe, expect, it } from "vitest";
import { extractSolcStandardJsonIr } from "../../../packages/analysis-ir/src/solc-standard-json.js";

const source = [
  "pragma solidity ^0.8.24;",
  "contract Vault {",
  "  uint256 public totalAssets;",
  "  event Withdraw(address indexed user, uint256 amount);",
  "  function withdraw(address payable target, uint256 amount) external payable {",
  "    target.call{value: amount}(\"\");",
  "    emit Withdraw(target, amount);",
  "  }",
  "}"
].join("\n");

describe("solc standard JSON IR extraction", () => {
  it("creates contract, function, event, and state variable IR from real AST output", () => {
    const ir = extractSolcStandardJsonIr({ artifact: solcArtifact() });

    expect(ir.status).toBe("EXTRACTED");
    expect(ir.contracts).toEqual([
      expect.objectContaining({
        name: "Vault",
        fullyQualifiedName: "contracts/Vault.sol:Vault"
      })
    ]);
    expect(ir.functions).toEqual([
      expect.objectContaining({
        contractName: "Vault",
        name: "withdraw",
        visibility: "external",
        stateMutability: "payable",
        selector: "3ccfd60b"
      })
    ]);
    expect(ir.stateVariables).toEqual([
      expect.objectContaining({
        contractName: "Vault",
        name: "totalAssets",
        typeName: "uint256"
      })
    ]);
    expect(ir.events).toEqual([
      expect.objectContaining({
        contractName: "Vault",
        name: "Withdraw"
      })
    ]);
  });

  it("extracts low-level external call sites and basic call graph edges", () => {
    const ir = extractSolcStandardJsonIr({ artifact: solcArtifact() });

    expect(ir.externalCallSites).toEqual([
      expect.objectContaining({
        contractName: "Vault",
        functionName: "withdraw",
        callKind: "CALL",
        lowLevel: true,
        valueTransfer: true,
        targetExpression: "target.call"
      })
    ]);
    expect(ir.callGraphEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromContract: "Vault",
          fromFunction: "withdraw",
          toFunction: "call",
          callKind: "LOW_LEVEL"
        })
      ])
    );
  });

  it("extracts storage layout and source-map entries when compiler output includes them", () => {
    const ir = extractSolcStandardJsonIr({ artifact: solcArtifact() });

    expect(ir.storageLayout).toEqual([
      expect.objectContaining({
        contractName: "Vault",
        label: "totalAssets",
        slot: "0",
        type: "t_uint256"
      })
    ]);
    expect(ir.sourceMaps).toEqual([
      expect.objectContaining({
        contractName: "Vault",
        artifact: "deployedBytecode",
        instructionIndex: 0,
        filePath: "contracts/Vault.sol"
      })
    ]);
  });
});

function solcArtifact() {
  return {
    sources: {
      "contracts/Vault.sol": {
        id: 0,
        content: source,
        ast: {
          nodeType: "SourceUnit",
          nodes: [
            {
              id: 1,
              nodeType: "ContractDefinition",
              name: "Vault",
              contractKind: "contract",
              src: src("contract Vault"),
              baseContracts: [],
              nodes: [
                {
                  id: 2,
                  nodeType: "VariableDeclaration",
                  stateVariable: true,
                  name: "totalAssets",
                  visibility: "public",
                  constant: false,
                  mutability: "mutable",
                  typeDescriptions: { typeString: "uint256" },
                  src: src("uint256 public totalAssets")
                },
                {
                  id: 3,
                  nodeType: "EventDefinition",
                  name: "Withdraw",
                  anonymous: false,
                  src: src("event Withdraw")
                },
                {
                  id: 4,
                  nodeType: "FunctionDefinition",
                  kind: "function",
                  name: "withdraw",
                  visibility: "external",
                  stateMutability: "payable",
                  modifiers: [],
                  src: src("function withdraw"),
                  body: {
                    nodeType: "Block",
                    statements: [
                      {
                        id: 5,
                        nodeType: "ExpressionStatement",
                        expression: {
                          id: 6,
                          nodeType: "FunctionCall",
                          names: ["value"],
                          src: src("target.call{value: amount}(\"\")"),
                          expression: {
                            nodeType: "MemberAccess",
                            memberName: "call",
                            expression: {
                              nodeType: "Identifier",
                              name: "target"
                            }
                          }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      }
    },
    contracts: {
      "contracts/Vault.sol": {
        Vault: {
          evm: {
            methodIdentifiers: {
              "withdraw(address,uint256)": "3ccfd60b"
            },
            deployedBytecode: {
              sourceMap: `${source.indexOf("target.call")}:11:0:-:0`
            }
          },
          storageLayout: {
            storage: [
              {
                astId: 2,
                label: "totalAssets",
                slot: "0",
                offset: 0,
                type: "t_uint256"
              }
            ],
            types: {
              t_uint256: {
                encoding: "inplace",
                numberOfBytes: "32"
              }
            }
          }
        }
      }
    }
  };
}

function src(fragment: string): string {
  const offset = source.indexOf(fragment);
  if (offset < 0) {
    throw new Error(`Missing fixture fragment: ${fragment}`);
  }
  return `${offset}:${fragment.length}:0`;
}
