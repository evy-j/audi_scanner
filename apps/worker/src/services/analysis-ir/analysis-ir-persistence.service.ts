import { prisma } from "@audit-scanner/database";
import {
  extractSolcStandardJsonIr,
  type AnalysisIr,
  type CallGraphEdgeIr,
  type ContractIr,
  type EventIr,
  type ExternalCallSiteIr,
  type FunctionIr,
  type ModifierIr,
  type SourceMapEntryIr,
  type SourceRange,
  type StateVariableIr,
  type StorageLayoutEntryIr
} from "@audit-scanner/analysis-ir";
import type { ExtractionStatus, Prisma } from "@prisma/client";
import { LocalScannerArtifactStore } from "../scan-execution/local-artifact-store.js";
import type { ScannerArtifactDescriptor } from "../scan-execution/scanner-execution.types.js";

interface SolcArtifactCandidate {
  artifactKey: string;
  checksum: string;
  artifact: unknown;
}

interface PersistedContractSymbol {
  id: string;
  name: string;
  fullyQualifiedName: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
}

interface PersistedFunctionSymbol {
  id: string;
  contractName: string;
  name: string;
  canonicalName: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
}

interface PersistedExternalCallSite {
  id: string;
  contractName: string;
  functionName: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
}

interface PersistedStorageLayoutEntry {
  id: string;
  contractName: string;
  label: string;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
}

interface FindingRange {
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
}

const JSON_ARTIFACT_LIMIT_BYTES = 25 * 1024 * 1024;

export class AnalysisIrPersistenceService {
  constructor(private readonly artifactStore = new LocalScannerArtifactStore()) {}

  async persistForScan(scanId: string, organizationId: string): Promise<void> {
    const scan = await prisma.scan.findFirst({
      where: { id: scanId, organizationId, deletedAt: null },
      include: {
        analyzerRuns: {
          orderBy: { startedAt: "desc" }
        }
      }
    });

    if (!scan) {
      return;
    }

    const preparedArtifactKey = findPreparedArtifactKey(scan.analyzerRuns) ?? fallbackPreparedArtifactKey(organizationId, scanId);
    const candidate = (await this.findPersistedCompilerArtifactCandidate(scanId)) ?? (preparedArtifactKey
      ? await this.findSolcArtifactCandidate(preparedArtifactKey)
      : null);

    if (!candidate) {
      await this.replaceWithNotAssessedRun({
        scanId,
        organizationId,
        projectId: scan.projectId,
        reason: "No solc standard JSON artifact with AST output was found in prepared source artifacts",
        preparedArtifactKey
      });
      return;
    }

    const sourceContents = await this.loadSourceContents(preparedArtifactKey, candidate.artifact);
    let ir: AnalysisIr;
    try {
      ir = extractSolcStandardJsonIr({
        artifact: candidate.artifact,
        sourceContents
      });
    } catch (error) {
      await this.replaceWithFailedRun({
        scanId,
        organizationId,
        projectId: scan.projectId,
        artifactKey: candidate.artifactKey,
        artifactChecksum: candidate.checksum,
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    if (ir.status === "NOT_ASSESSED") {
      await this.replaceWithNotAssessedRun({
        scanId,
        organizationId,
        projectId: scan.projectId,
        artifactKey: candidate.artifactKey,
        artifactChecksum: candidate.checksum,
        reason: ir.reason ?? "Solidity AST/source-map output was not available in solc artifact",
        preparedArtifactKey
      });
      return;
    }

    await this.replaceWithExtractedRun({
      scanId,
      organizationId,
      projectId: scan.projectId,
      analyzerRunId: scan.analyzerRuns[0]?.id,
      artifactKey: candidate.artifactKey,
      artifactChecksum: candidate.checksum,
      preparedArtifactKey,
      ir
    });
  }

  private async findSolcArtifactCandidate(preparedArtifactKey: string): Promise<SolcArtifactCandidate | null> {
    const descriptors = await this.artifactStore.collectArtifacts(preparedArtifactKey).catch(() => []);
    const jsonArtifacts = descriptors
      .filter((descriptor) => descriptor.relativePath.toLowerCase().endsWith(".json"))
      .filter((descriptor) => descriptor.sizeBytes <= JSON_ARTIFACT_LIMIT_BYTES)
      .sort(compareSolcArtifactPriority);

    for (const descriptor of jsonArtifacts) {
      const text = await this.artifactStore.readTextByArtifactKey(descriptor.artifactKey);
      if (!text) {
        continue;
      }

      const artifact = parseJson(text);
      if (artifact !== null && looksLikeSolcOutputArtifact(artifact)) {
        return {
          artifactKey: descriptor.artifactKey,
          checksum: descriptor.sha256,
          artifact
        };
      }
    }

    return null;
  }

  private async findPersistedCompilerArtifactCandidate(scanId: string): Promise<SolcArtifactCandidate | null> {
    const artifacts = await prisma.compilerArtifact.findMany({
      where: {
        scanId,
        artifactKind: {
          in: ["SOLC_STANDARD_JSON", "FOUNDRY_BUILD_INFO", "HARDHAT_BUILD_INFO", "BUILD_INFO"]
        }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    });

    for (const artifactRecord of artifacts) {
      const text = await this.artifactStore.readTextByArtifactKey(artifactRecord.artifactKey).catch(() => null);
      if (!text) {
        continue;
      }
      const artifact = parseJson(text);
      if (artifact !== null && looksLikeSolcOutputArtifact(artifact)) {
        return {
          artifactKey: artifactRecord.artifactKey,
          checksum: artifactRecord.checksumSha256,
          artifact
        };
      }
    }

    return null;
  }

  private async loadSourceContents(
    preparedArtifactKey: string,
    artifact: unknown
  ): Promise<Record<string, string>> {
    const contents: Record<string, string> = {};
    for (const sourcePath of collectSourcePaths(artifact)) {
      const artifactKey = toPreparedSourceArtifactKey(preparedArtifactKey, sourcePath);
      if (!artifactKey) {
        continue;
      }
      const source = await this.artifactStore.readTextByArtifactKey(artifactKey).catch(() => null);
      if (source !== null) {
        contents[sourcePath] = source;
      }
    }
    return contents;
  }

  private async replaceWithNotAssessedRun(input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    artifactKey?: string | undefined;
    artifactChecksum?: string | undefined;
    reason: string;
    preparedArtifactKey?: string | undefined;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await deleteExistingIr(tx, input.scanId);
      await tx.analysisIrRun.create({
        data: {
          scanId: input.scanId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          artifactKey: input.artifactKey ?? null,
          artifactChecksum: input.artifactChecksum ?? null,
          extractionStatus: "NOT_ASSESSED",
          finishedAt: new Date(),
          error: input.reason,
          metadata: toJsonObject({
            reason: input.reason,
            preparedArtifactKey: input.preparedArtifactKey ?? null,
            storageLayoutStatus: "NOT_ASSESSED",
            basicCallGraphStatus: "NOT_ASSESSED"
          })
        }
      });
    });
  }

  private async replaceWithFailedRun(input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    artifactKey: string;
    artifactChecksum: string;
    error: string;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await deleteExistingIr(tx, input.scanId);
      await tx.analysisIrRun.create({
        data: {
          scanId: input.scanId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          artifactKey: input.artifactKey,
          artifactChecksum: input.artifactChecksum,
          extractionStatus: "FAILED",
          finishedAt: new Date(),
          error: input.error,
          metadata: toJsonObject({
            reason: input.error,
            storageLayoutStatus: "NOT_ASSESSED",
            basicCallGraphStatus: "NOT_ASSESSED"
          })
        }
      });
    });
  }

  private async replaceWithExtractedRun(input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    analyzerRunId?: string | undefined;
    artifactKey: string;
    artifactChecksum: string;
    preparedArtifactKey: string;
    ir: AnalysisIr;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await deleteExistingIr(tx, input.scanId);
      const run = await tx.analysisIrRun.create({
        data: {
          scanId: input.scanId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          analyzerRunId: input.analyzerRunId ?? null,
          artifactKey: input.artifactKey,
          artifactChecksum: input.artifactChecksum,
          extractionStatus: input.ir.status,
          finishedAt: new Date(),
          error: input.ir.reason ?? null,
          metadata: toJsonObject({
            preparedArtifactKey: input.preparedArtifactKey,
            fileCount: input.ir.files.length,
            contractCount: input.ir.contracts.length,
            functionCount: input.ir.functions.length,
            externalCallCount: input.ir.externalCallSites.length,
            storageLayoutStatus: input.ir.storageLayout.length > 0 ? "EXTRACTED" : "NOT_ASSESSED",
            basicCallGraphStatus: input.ir.callGraphEdges.length > 0 ? "EXTRACTED" : "NOT_ASSESSED",
            sourceMapStatus: input.ir.sourceMaps.length > 0 ? "EXTRACTED" : "NOT_ASSESSED"
          })
        }
      });

      const contracts = await persistContracts(tx, input, run.id);
      const functions = await persistFunctions(tx, input, run.id, contracts);
      await persistModifiers(tx, input, run.id, contracts);
      await persistEvents(tx, input, run.id, contracts);
      await persistStateVariables(tx, input, run.id, contracts);
      await persistCallGraph(tx, input, run.id, functions);
      const externalCalls = await persistExternalCalls(tx, input, run.id);
      const storageEntries = await persistStorageLayout(tx, input, run.id);
      await persistSourceMaps(tx, input, run.id);
      await persistFindingCodeLinks(tx, input, run.id, contracts, functions, externalCalls, storageEntries);
    });
  }
}

async function deleteExistingIr(tx: Prisma.TransactionClient, scanId: string): Promise<void> {
  await tx.findingCodeLink.deleteMany({ where: { scanId } });
  await tx.analysisIrRun.deleteMany({ where: { scanId } });
}

async function persistContracts(
  tx: Prisma.TransactionClient,
  input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    analyzerRunId?: string | undefined;
    artifactKey: string;
    ir: AnalysisIr;
  },
  analysisIrRunId: string
): Promise<PersistedContractSymbol[]> {
  const records: PersistedContractSymbol[] = [];
  for (const contract of input.ir.contracts) {
    const record = await tx.contractSymbol.create({
      data: {
        analysisIrRunId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        analyzerRunId: input.analyzerRunId ?? null,
        artifactKey: input.artifactKey,
        ...rangeFields(contract.sourceRange, contract.filePath),
        extractionStatus: rangeStatus(contract.sourceRange),
        astId: contract.astId ?? null,
        name: contract.name,
        kind: contract.kind ?? null,
        fullyQualifiedName: contract.fullyQualifiedName,
        inheritance: contract.inheritance,
        metadata: toJsonObject({ sourceRange: contract.sourceRange })
      }
    });
    records.push({
      id: record.id,
      name: record.name,
      fullyQualifiedName: record.fullyQualifiedName,
      filePath: record.filePath,
      startLine: record.startLine,
      endLine: record.endLine
    });
  }
  return records;
}

async function persistFunctions(
  tx: Prisma.TransactionClient,
  input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    analyzerRunId?: string | undefined;
    artifactKey: string;
    ir: AnalysisIr;
  },
  analysisIrRunId: string,
  contracts: PersistedContractSymbol[]
): Promise<PersistedFunctionSymbol[]> {
  const records: PersistedFunctionSymbol[] = [];
  for (const fn of input.ir.functions) {
    const contract = findContractForFunction(fn, contracts);
    const record = await tx.functionSymbol.create({
      data: {
        analysisIrRunId,
        contractSymbolId: contract?.id ?? null,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        analyzerRunId: input.analyzerRunId ?? null,
        artifactKey: input.artifactKey,
        ...rangeFields(fn.sourceRange, fn.filePath),
        extractionStatus: rangeStatus(fn.sourceRange),
        astId: fn.astId ?? null,
        contractName: fn.contractName,
        name: fn.name,
        canonicalName: fn.canonicalName,
        kind: fn.kind ?? null,
        visibility: fn.visibility ?? null,
        stateMutability: fn.stateMutability ?? null,
        payable: fn.payable,
        selector: fn.selector ?? null,
        modifiers: fn.modifiers,
        metadata: toJsonObject({ sourceRange: fn.sourceRange })
      }
    });
    records.push({
      id: record.id,
      contractName: record.contractName,
      name: record.name,
      canonicalName: record.canonicalName,
      filePath: record.filePath,
      startLine: record.startLine,
      endLine: record.endLine
    });
  }
  return records;
}

async function persistModifiers(
  tx: Prisma.TransactionClient,
  input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    analyzerRunId?: string | undefined;
    artifactKey: string;
    ir: AnalysisIr;
  },
  analysisIrRunId: string,
  contracts: PersistedContractSymbol[]
): Promise<void> {
  for (const modifier of input.ir.modifiers) {
    const contract = contracts.find((item) => item.name === modifier.contractName);
    await tx.modifierSymbol.create({
      data: {
        analysisIrRunId,
        contractSymbolId: contract?.id ?? null,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        analyzerRunId: input.analyzerRunId ?? null,
        artifactKey: input.artifactKey,
        ...rangeFields(modifier.sourceRange, modifier.filePath),
        extractionStatus: rangeStatus(modifier.sourceRange),
        astId: modifier.astId ?? null,
        contractName: modifier.contractName,
        name: modifier.name,
        visibility: modifier.visibility ?? null,
        metadata: toJsonObject({ sourceRange: modifier.sourceRange })
      }
    });
  }
}

async function persistEvents(
  tx: Prisma.TransactionClient,
  input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    analyzerRunId?: string | undefined;
    artifactKey: string;
    ir: AnalysisIr;
  },
  analysisIrRunId: string,
  contracts: PersistedContractSymbol[]
): Promise<void> {
  for (const event of input.ir.events) {
    const contract = contracts.find((item) => item.name === event.contractName);
    await tx.eventSymbol.create({
      data: {
        analysisIrRunId,
        contractSymbolId: contract?.id ?? null,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        analyzerRunId: input.analyzerRunId ?? null,
        artifactKey: input.artifactKey,
        ...rangeFields(event.sourceRange, event.filePath),
        extractionStatus: rangeStatus(event.sourceRange),
        astId: event.astId ?? null,
        contractName: event.contractName,
        name: event.name,
        anonymous: event.anonymous,
        metadata: toJsonObject({ sourceRange: event.sourceRange })
      }
    });
  }
}

async function persistStateVariables(
  tx: Prisma.TransactionClient,
  input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    analyzerRunId?: string | undefined;
    artifactKey: string;
    ir: AnalysisIr;
  },
  analysisIrRunId: string,
  contracts: PersistedContractSymbol[]
): Promise<void> {
  for (const variable of input.ir.stateVariables) {
    const contract = contracts.find((item) => item.name === variable.contractName);
    await tx.stateVariableSymbol.create({
      data: {
        analysisIrRunId,
        contractSymbolId: contract?.id ?? null,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        analyzerRunId: input.analyzerRunId ?? null,
        artifactKey: input.artifactKey,
        ...rangeFields(variable.sourceRange, variable.filePath),
        extractionStatus: rangeStatus(variable.sourceRange),
        astId: variable.astId ?? null,
        contractName: variable.contractName,
        name: variable.name,
        typeName: variable.typeName ?? null,
        visibility: variable.visibility ?? null,
        constant: variable.constant,
        immutable: variable.immutable,
        metadata: toJsonObject({ sourceRange: variable.sourceRange })
      }
    });
  }
}

async function persistCallGraph(
  tx: Prisma.TransactionClient,
  input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    analyzerRunId?: string | undefined;
    artifactKey: string;
    ir: AnalysisIr;
  },
  analysisIrRunId: string,
  functions: PersistedFunctionSymbol[]
): Promise<void> {
  for (const edge of input.ir.callGraphEdges) {
    const fromFunction = functions.find(
      (fn) => fn.contractName === edge.fromContract && fn.name === edge.fromFunction
    );
    const toFunction = findToFunction(edge, functions);
    await tx.callGraphEdge.create({
      data: {
        analysisIrRunId,
        fromFunctionSymbolId: fromFunction?.id ?? null,
        toFunctionSymbolId: toFunction?.id ?? null,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        analyzerRunId: input.analyzerRunId ?? null,
        artifactKey: input.artifactKey,
        ...rangeFields(edge.sourceRange, edge.filePath),
        extractionStatus: rangeStatus(edge.sourceRange),
        fromContract: edge.fromContract,
        fromFunction: edge.fromFunction,
        toContract: edge.toContract ?? null,
        toFunction: edge.toFunction ?? null,
        callKind: edge.callKind,
        targetExpression: edge.targetExpression ?? null,
        metadata: toJsonObject({ sourceRange: edge.sourceRange })
      }
    });
  }
}

async function persistExternalCalls(
  tx: Prisma.TransactionClient,
  input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    analyzerRunId?: string | undefined;
    artifactKey: string;
    ir: AnalysisIr;
  },
  analysisIrRunId: string
): Promise<PersistedExternalCallSite[]> {
  const records: PersistedExternalCallSite[] = [];
  for (const call of input.ir.externalCallSites) {
    const record = await tx.externalCallSite.create({
      data: {
        analysisIrRunId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        analyzerRunId: input.analyzerRunId ?? null,
        artifactKey: input.artifactKey,
        ...rangeFields(call.sourceRange, call.filePath),
        extractionStatus: rangeStatus(call.sourceRange),
        contractName: call.contractName,
        functionName: call.functionName,
        callKind: call.callKind,
        targetExpression: call.targetExpression ?? null,
        valueTransfer: call.valueTransfer,
        lowLevel: call.lowLevel,
        confidence: call.confidence,
        metadata: toJsonObject({ sourceRange: call.sourceRange })
      }
    });
    records.push({
      id: record.id,
      contractName: record.contractName,
      functionName: record.functionName,
      filePath: record.filePath,
      startLine: record.startLine,
      endLine: record.endLine
    });
  }
  return records;
}

async function persistStorageLayout(
  tx: Prisma.TransactionClient,
  input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    analyzerRunId?: string | undefined;
    artifactKey: string;
    ir: AnalysisIr;
  },
  analysisIrRunId: string
): Promise<PersistedStorageLayoutEntry[]> {
  const records: PersistedStorageLayoutEntry[] = [];
  for (const entry of input.ir.storageLayout) {
    const record = await tx.storageLayoutEntry.create({
      data: {
        analysisIrRunId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        analyzerRunId: input.analyzerRunId ?? null,
        artifactKey: input.artifactKey,
        extractionStatus: "EXTRACTED",
        contractName: entry.contractName,
        astId: entry.astId ?? null,
        label: entry.label,
        slot: entry.slot,
        offset: entry.offset,
        typeName: entry.type,
        encoding: entry.encoding ?? null,
        numberOfBytes: entry.numberOfBytes ?? null,
        metadata: toJsonObject({ storageLayout: entry })
      }
    });
    records.push({
      id: record.id,
      contractName: record.contractName,
      label: record.label,
      filePath: record.filePath,
      startLine: record.startLine,
      endLine: record.endLine
    });
  }
  return records;
}

async function persistSourceMaps(
  tx: Prisma.TransactionClient,
  input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
    analyzerRunId?: string | undefined;
    artifactKey: string;
    ir: AnalysisIr;
  },
  analysisIrRunId: string
): Promise<void> {
  for (const entry of input.ir.sourceMaps) {
    await tx.sourceMapEntry.create({
      data: {
        analysisIrRunId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        scanId: input.scanId,
        analyzerRunId: input.analyzerRunId ?? null,
        artifactKey: input.artifactKey,
        ...rangeFields(entry.sourceRange, entry.filePath),
        extractionStatus: rangeStatus(entry.sourceRange),
        contractName: entry.contractName,
        artifact: entry.artifact,
        instructionIndex: entry.instructionIndex,
        sourceIndex: entry.sourceIndex ?? null,
        offset: entry.offset ?? null,
        jump: entry.jump ?? null,
        modifierDepth: entry.modifierDepth ?? null,
        metadata: toJsonObject({ sourceMap: entry })
      }
    });
  }
}

async function persistFindingCodeLinks(
  tx: Prisma.TransactionClient,
  input: {
    scanId: string;
    organizationId: string;
    projectId: string | null;
  },
  analysisIrRunId: string,
  contracts: PersistedContractSymbol[],
  functions: PersistedFunctionSymbol[],
  externalCalls: PersistedExternalCallSite[],
  storageEntries: PersistedStorageLayoutEntry[]
): Promise<void> {
  const findings = await tx.vulnerability.findMany({
    where: { scanId: input.scanId, deletedAt: null },
    include: {
      sourceRanges: true,
      evidenceItems: true
    }
  });

  for (const finding of findings) {
    const ranges = findingRanges(finding);
    const linkedContractIds = new Set<string>();
    const linkedFunctionIds = new Set<string>();
    const linkedExternalCallIds = new Set<string>();
    const linkedStorageIds = new Set<string>();

    for (const contract of contracts) {
      if (ranges.some((range) => overlaps(range, contract))) {
        linkedContractIds.add(contract.id);
      }
    }

    for (const fn of functions) {
      if (ranges.some((range) => overlaps(range, fn))) {
        linkedFunctionIds.add(fn.id);
        const contract = contracts.find((item) => item.name === fn.contractName);
        if (contract) {
          linkedContractIds.add(contract.id);
        }
      }
    }

    for (const call of externalCalls) {
      if (ranges.some((range) => overlaps(range, call))) {
        linkedExternalCallIds.add(call.id);
      }
    }

    for (const entry of storageEntries) {
      if (mentionsStorageEntry(finding, entry)) {
        linkedStorageIds.add(entry.id);
      }
    }

    for (const contractId of linkedContractIds) {
      const contract = contracts.find((item) => item.id === contractId);
      await tx.findingCodeLink.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          findingId: finding.id,
          analysisIrRunId,
          contractSymbolId: contractId,
          filePath: contract?.filePath ?? finding.filePath,
          startLine: contract?.startLine ?? finding.lineStart,
          endLine: contract?.endLine ?? finding.lineEnd,
          extractionStatus: "EXTRACTED",
          linkType: "CONTRACT",
          confidence: 0.7,
          reason: "Finding source range overlaps contract symbol range"
        }
      });
    }

    for (const functionId of linkedFunctionIds) {
      const fn = functions.find((item) => item.id === functionId);
      await tx.findingCodeLink.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          findingId: finding.id,
          analysisIrRunId,
          functionSymbolId: functionId,
          filePath: fn?.filePath ?? finding.filePath,
          startLine: fn?.startLine ?? finding.lineStart,
          endLine: fn?.endLine ?? finding.lineEnd,
          extractionStatus: "EXTRACTED",
          linkType: "FUNCTION",
          confidence: 0.9,
          reason: "Finding source range overlaps function symbol range"
        }
      });
    }

    for (const externalCallSiteId of linkedExternalCallIds) {
      const call = externalCalls.find((item) => item.id === externalCallSiteId);
      await tx.findingCodeLink.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          findingId: finding.id,
          analysisIrRunId,
          externalCallSiteId,
          filePath: call?.filePath ?? finding.filePath,
          startLine: call?.startLine ?? finding.lineStart,
          endLine: call?.endLine ?? finding.lineEnd,
          extractionStatus: "EXTRACTED",
          linkType: "EXTERNAL_CALL",
          confidence: 0.85,
          reason: "Finding source range overlaps external call site"
        }
      });
    }

    for (const storageLayoutEntryId of linkedStorageIds) {
      const entry = storageEntries.find((item) => item.id === storageLayoutEntryId);
      await tx.findingCodeLink.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          scanId: input.scanId,
          findingId: finding.id,
          analysisIrRunId,
          storageLayoutEntryId,
          filePath: entry?.filePath ?? finding.filePath,
          startLine: entry?.startLine ?? finding.lineStart,
          endLine: entry?.endLine ?? finding.lineEnd,
          extractionStatus: "EXTRACTED",
          linkType: "STORAGE_LAYOUT",
          confidence: 0.6,
          reason: "Finding text references a persisted storage layout label"
        }
      });
    }
  }
}

function compareSolcArtifactPriority(a: ScannerArtifactDescriptor, b: ScannerArtifactDescriptor): number {
  return solcArtifactPriority(a.relativePath) - solcArtifactPriority(b.relativePath);
}

function solcArtifactPriority(relativePath: string): number {
  const normalized = relativePath.toLowerCase();
  if (normalized.includes("build-info")) return 0;
  if (normalized.includes("standard-json") || normalized.includes("solc")) return 1;
  if (normalized.includes("artifact")) return 2;
  return 3;
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function looksLikeSolcOutputArtifact(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) {
    return false;
  }
  const output = asRecord(record.output) ?? record;
  return Boolean(asRecord(output.sources) && asRecord(output.contracts));
}

function collectSourcePaths(value: unknown): string[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }
  const output = asRecord(record.output) ?? record;
  const sources = asRecord(output.sources) ?? {};
  return Object.keys(sources);
}

function toPreparedSourceArtifactKey(preparedArtifactKey: string, sourcePath: string): string | null {
  const normalized = sourcePath.replace(/\\/gu, "/").replace(/^\.\//u, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || normalized === "..") {
    return null;
  }
  return `${preparedArtifactKey}/${normalized}`;
}

function findPreparedArtifactKey(
  analyzerRuns: Array<{ metadata: Prisma.JsonValue }>
): string | undefined {
  for (const run of analyzerRuns) {
    const metadata = asRecord(run.metadata);
    const key = metadata?.preparedArtifactKey;
    if (typeof key === "string" && key.length > 0) {
      return key;
    }
  }
  return undefined;
}

function fallbackPreparedArtifactKey(organizationId: string, scanId: string): string {
  return `prepared-sources/${organizationId}/${scanId}`;
}

function findContractForFunction(
  fn: FunctionIr,
  contracts: PersistedContractSymbol[]
): PersistedContractSymbol | undefined {
  return contracts.find(
    (contract) =>
      contract.name === fn.contractName &&
      (!fn.filePath || !contract.filePath || samePath(contract.filePath, fn.filePath))
  );
}

function findToFunction(
  edge: CallGraphEdgeIr,
  functions: PersistedFunctionSymbol[]
): PersistedFunctionSymbol | undefined {
  if (!edge.toFunction) {
    return undefined;
  }
  return functions.find(
    (fn) =>
      fn.name === edge.toFunction &&
      (edge.toContract === undefined || fn.contractName === edge.toContract || edge.toContract === null)
  );
}

function findingRanges(finding: {
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  sourceRanges: Array<{ filePath: string; startLine: number | null; endLine: number | null }>;
  evidenceItems: Array<{ filePath: string | null; startLine: number | null; endLine: number | null }>;
}): FindingRange[] {
  const ranges: FindingRange[] = [
    {
      filePath: finding.filePath,
      startLine: finding.lineStart,
      endLine: finding.lineEnd
    }
  ];

  for (const range of finding.sourceRanges) {
    ranges.push({
      filePath: range.filePath,
      startLine: range.startLine,
      endLine: range.endLine
    });
  }

  for (const evidence of finding.evidenceItems) {
    ranges.push({
      filePath: evidence.filePath,
      startLine: evidence.startLine,
      endLine: evidence.endLine
    });
  }

  return ranges.filter((range) => range.filePath && range.startLine);
}

function overlaps(
  findingRange: FindingRange,
  symbol: { filePath: string | null; startLine: number | null; endLine: number | null }
): boolean {
  if (!findingRange.filePath || !symbol.filePath || !samePath(findingRange.filePath, symbol.filePath)) {
    return false;
  }
  if (!findingRange.startLine || !symbol.startLine) {
    return false;
  }
  const findingStart = findingRange.startLine;
  const findingEnd = findingRange.endLine ?? findingStart;
  const symbolStart = symbol.startLine;
  const symbolEnd = symbol.endLine ?? symbolStart;
  return findingStart <= symbolEnd && findingEnd >= symbolStart;
}

function mentionsStorageEntry(
  finding: {
    title: string;
    description: string | null;
    contractName: string | null;
    filePath: string | null;
    evidenceItems: Array<{ message: string | null; snippet: string | null }>;
  },
  entry: PersistedStorageLayoutEntry
): boolean {
  if (finding.contractName && finding.contractName !== entry.contractName) {
    return false;
  }
  const haystack = [
    finding.title,
    finding.description,
    ...finding.evidenceItems.flatMap((item) => [item.message, item.snippet])
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return haystack.includes(entry.label.toLowerCase());
}

function samePath(left: string, right: string): boolean {
  return normalizePath(left) === normalizePath(right);
}

function normalizePath(value: string): string {
  return value.replace(/\\/gu, "/").replace(/^\.\//u, "").toLowerCase();
}

function rangeFields(range: SourceRange, fallbackFilePath?: string | undefined) {
  return {
    filePath: range.filePath ?? fallbackFilePath ?? null,
    startLine: range.startLine ?? null,
    endLine: range.endLine ?? null,
    startColumn: range.startColumn ?? null,
    endColumn: range.endColumn ?? null,
    startOffset: range.startOffset ?? null,
    sourceLength: range.length ?? null
  };
}

function rangeStatus(range: SourceRange): ExtractionStatus {
  return range.status;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toJsonObject(value: Record<string, unknown>): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
