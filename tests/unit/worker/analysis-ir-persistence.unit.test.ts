import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  projectId: "00000000-0000-4000-8000-000000000002",
  scanId: "00000000-0000-4000-8000-000000000003",
  analyzerRunId: "00000000-0000-4000-8000-000000000004",
  findingId: "00000000-0000-4000-8000-000000000005"
};

const db = vi.hoisted(() => {
  const tx = {
    findingCodeLink: {
      deleteMany: vi.fn(),
      create: vi.fn()
    },
    analysisIrRun: {
      deleteMany: vi.fn(),
      create: vi.fn()
    },
    contractSymbol: {
      create: vi.fn()
    },
    functionSymbol: {
      create: vi.fn()
    },
    modifierSymbol: {
      create: vi.fn()
    },
    eventSymbol: {
      create: vi.fn()
    },
    stateVariableSymbol: {
      create: vi.fn()
    },
    callGraphEdge: {
      create: vi.fn()
    },
    externalCallSite: {
      create: vi.fn()
    },
    storageLayoutEntry: {
      create: vi.fn()
    },
    sourceMapEntry: {
      create: vi.fn()
    },
    vulnerability: {
      findMany: vi.fn()
    }
  };

  return {
    tx,
    prisma: {
      scan: {
        findFirst: vi.fn()
      },
      compilerArtifact: {
        findMany: vi.fn()
      },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) =>
        callback(tx)
      )
    }
  };
});

vi.mock("@audit-scanner/database", () => ({
  prisma: db.prisma
}));

describe("AnalysisIrPersistenceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.tx.analysisIrRun.create.mockImplementation(async ({ data }) => ({
      id: "ir-run-id",
      ...data
    }));
    db.tx.contractSymbol.create.mockImplementation(async ({ data }) => ({
      id: "contract-symbol-id",
      ...data
    }));
    db.tx.functionSymbol.create.mockImplementation(async ({ data }) => ({
      id: "function-symbol-id",
      ...data
    }));
    db.tx.externalCallSite.create.mockImplementation(async ({ data }) => ({
      id: "external-call-id",
      ...data
    }));
    db.tx.storageLayoutEntry.create.mockImplementation(async ({ data }) => ({
      id: "storage-layout-id",
      ...data
    }));
    db.tx.stateVariableSymbol.create.mockImplementation(async ({ data }) => ({
      id: "state-variable-id",
      ...data
    }));
    db.tx.findingCodeLink.create.mockResolvedValue({});
    db.tx.findingCodeLink.deleteMany.mockResolvedValue({ count: 0 });
    db.tx.analysisIrRun.deleteMany.mockResolvedValue({ count: 0 });
    db.tx.vulnerability.findMany.mockResolvedValue([]);
    db.prisma.compilerArtifact.findMany.mockResolvedValue([]);
  });

  it("creates a NOT_ASSESSED IR run when no solc artifact is available", async () => {
    db.prisma.scan.findFirst.mockResolvedValue(scan());
    const artifactStore = {
      collectArtifacts: vi.fn(async () => []),
      readTextByArtifactKey: vi.fn()
    };

    const { AnalysisIrPersistenceService } = await import(
      "../../../apps/worker/src/services/analysis-ir/analysis-ir-persistence.service.js"
    );
    await new AnalysisIrPersistenceService(artifactStore as never).persistForScan(
      ids.scanId,
      ids.organizationId
    );

    expect(db.tx.analysisIrRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scanId: ids.scanId,
          organizationId: ids.organizationId,
          projectId: ids.projectId,
          extractionStatus: "NOT_ASSESSED",
          error: "No solc standard JSON artifact with AST output was found in prepared source artifacts"
        })
      })
    );
  });

  it("persists extracted IR rows and links overlapping findings to code symbols", async () => {
    db.prisma.scan.findFirst.mockResolvedValue(scan("prepared/org/scan"));
    db.tx.vulnerability.findMany.mockResolvedValue([
      {
        id: ids.findingId,
        title: "External call before state update",
        description: "target.call occurs before accounting update",
        contractName: "Vault",
        filePath: "contracts/Vault.sol",
        lineStart: 5,
        lineEnd: 5,
        sourceRanges: [],
        evidenceItems: [
          {
            filePath: "contracts/Vault.sol",
            startLine: 5,
            endLine: 5,
            message: "target.call before state update",
            snippet: "target.call{value: amount}(\"\");"
          }
        ]
      }
    ]);
    const artifactStore = {
      collectArtifacts: vi.fn(async () => [
        {
          artifactKey: "prepared/org/scan/solc-output.json",
          relativePath: "solc-output.json",
          sizeBytes: 1_000,
          sha256: "sha256-solc",
          contentType: "application/json"
        }
      ]),
      readTextByArtifactKey: vi.fn(async (artifactKey: string) =>
        artifactKey.endsWith(".json") ? JSON.stringify(solcArtifact()) : source
      )
    };

    const { AnalysisIrPersistenceService } = await import(
      "../../../apps/worker/src/services/analysis-ir/analysis-ir-persistence.service.js"
    );
    await new AnalysisIrPersistenceService(artifactStore as never).persistForScan(
      ids.scanId,
      ids.organizationId
    );

    expect(db.tx.analysisIrRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          extractionStatus: "EXTRACTED",
          artifactKey: "prepared/org/scan/solc-output.json",
          artifactChecksum: "sha256-solc"
        })
      })
    );
    expect(db.tx.contractSymbol.create).toHaveBeenCalledOnce();
    expect(db.tx.functionSymbol.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contractName: "Vault",
          name: "withdraw",
          extractionStatus: "EXTRACTED"
        })
      })
    );
    expect(db.tx.externalCallSite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          callKind: "CALL",
          lowLevel: true,
          valueTransfer: true
        })
      })
    );
    expect(db.tx.storageLayoutEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contractName: "Vault",
          label: "totalAssets",
          slot: "0",
          typeName: "t_uint256"
        })
      })
    );
    expect(db.tx.findingCodeLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          findingId: ids.findingId,
          linkType: "FUNCTION",
          functionSymbolId: "function-symbol-id"
        })
      })
    );
    expect(db.tx.findingCodeLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          findingId: ids.findingId,
          linkType: "EXTERNAL_CALL",
          externalCallSiteId: "external-call-id"
        })
      })
    );
  });
});

const source = [
  "pragma solidity ^0.8.24;",
  "contract Vault {",
  "  uint256 public totalAssets;",
  "  function withdraw(address payable target, uint256 amount) external payable {",
  "    target.call{value: amount}(\"\");",
  "  }",
  "}"
].join("\n");

function scan(preparedArtifactKey?: string) {
  return {
    id: ids.scanId,
    organizationId: ids.organizationId,
    projectId: ids.projectId,
    analyzerRuns: [
      {
        id: ids.analyzerRunId,
        metadata: preparedArtifactKey ? { preparedArtifactKey } : {},
        startedAt: new Date("2026-05-23T00:00:00.000Z")
      }
    ]
  };
}

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
              src: srcFrom("contract Vault", "}"),
              baseContracts: [],
              nodes: [
                {
                  id: 2,
                  nodeType: "VariableDeclaration",
                  stateVariable: true,
                  name: "totalAssets",
                  visibility: "public",
                  constant: false,
                  typeDescriptions: { typeString: "uint256" },
                  src: src("uint256 public totalAssets")
                },
                {
                  id: 3,
                  nodeType: "FunctionDefinition",
                  kind: "function",
                  name: "withdraw",
                  visibility: "external",
                  stateMutability: "payable",
                  modifiers: [],
                  src: srcFrom("function withdraw", "  }"),
                  body: {
                    nodeType: "Block",
                    statements: [
                      {
                        nodeType: "ExpressionStatement",
                        expression: {
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
  return `${offset}:${fragment.length}:0`;
}

function srcFrom(startFragment: string, endFragment: string): string {
  const offset = source.indexOf(startFragment);
  const end = source.indexOf(endFragment, offset) + endFragment.length;
  return `${offset}:${end - offset}:0`;
}
