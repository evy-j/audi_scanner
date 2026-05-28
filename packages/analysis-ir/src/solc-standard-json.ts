import type {
  AnalysisIr,
  CallGraphEdgeIr,
  ContractIr,
  EventIr,
  ExternalCallSiteIr,
  FunctionIr,
  ModifierIr,
  SolidityFileRecord,
  SourceMapEntryIr,
  StateVariableIr,
  StorageLayoutEntryIr
} from "./types.js";
import { SolidityFileRegistry } from "./source-range.js";

export interface SolcExtractionInput {
  artifact: unknown;
  sourceContents?: Record<string, string> | undefined;
}

type SolcNode = Record<string, unknown>;

export function extractSolcStandardJsonIr(input: SolcExtractionInput): AnalysisIr {
  const artifact = asRecord(input.artifact);
  if (!artifact) {
    return notAssessed("Solc artifact is not a JSON object");
  }
  const output = unwrapSolcOutput(artifact);
  if (!looksLikeSolcOutput(output)) {
    return notAssessed("Solc standard JSON output was not found");
  }

  const files = buildFileRegistry(output, input.sourceContents ?? {});
  const registry = new SolidityFileRegistry(files);
  const contracts: ContractIr[] = [];
  const functions: FunctionIr[] = [];
  const modifiers: ModifierIr[] = [];
  const events: EventIr[] = [];
  const stateVariables: StateVariableIr[] = [];
  const callGraphEdges: CallGraphEdgeIr[] = [];
  const externalCallSites: ExternalCallSiteIr[] = [];
  const storageLayout: StorageLayoutEntryIr[] = [];
  const sourceMaps: SourceMapEntryIr[] = [];

  const sourceRecords = asRecord(output.sources) ?? {};
  const outputContracts = asRecord(output.contracts) ?? {};

  for (const [filePath, sourceRecordRaw] of Object.entries(sourceRecords)) {
    const sourceRecord = asRecord(sourceRecordRaw) ?? {};
    const ast = asRecord(sourceRecord.ast);
    if (!ast) {
      continue;
    }

    for (const contractNode of childNodes(ast).filter((node) => node.nodeType === "ContractDefinition")) {
      const contractName = stringValue(contractNode.name) ?? "UnknownContract";
      const contractOutput = asRecord(asRecord(outputContracts[filePath])?.[contractName]) ?? {};
      const contract = extractContract(filePath, contractNode, registry);
      contracts.push(contract);
      const selectors = methodSelectors(contractOutput);

      for (const node of childNodes(contractNode)) {
        switch (node.nodeType) {
          case "FunctionDefinition": {
            const fn = extractFunction(contractName, node, selectors, registry);
            functions.push(fn);
            const calls = extractCalls(contractName, fn.name, node, registry);
            callGraphEdges.push(...calls.edges);
            externalCallSites.push(...calls.externalCalls);
            break;
          }
          case "ModifierDefinition":
            modifiers.push(extractModifier(contractName, node, registry));
            break;
          case "EventDefinition":
            events.push(extractEvent(contractName, node, registry));
            break;
          case "VariableDeclaration":
            if (node.stateVariable === true) {
              stateVariables.push(extractStateVariable(contractName, node, registry));
            }
            break;
        }
      }

      storageLayout.push(...extractStorageLayout(contractName, contractOutput));
      sourceMaps.push(...extractSourceMaps(contractName, contractOutput, registry));
    }
  }

  const hasAst = contracts.length > 0 || functions.length > 0 || stateVariables.length > 0;
  const hasStorageOrMaps = storageLayout.length > 0 || sourceMaps.length > 0;
  return {
    status: hasAst ? "EXTRACTED" : hasStorageOrMaps ? "PARTIAL" : "NOT_ASSESSED",
    ...(hasAst ? {} : { reason: "No Solidity AST nodes were available in the solc artifact" }),
    files,
    contracts,
    functions,
    modifiers,
    events,
    stateVariables,
    callGraphEdges,
    externalCallSites,
    storageLayout,
    sourceMaps
  };
}

function unwrapSolcOutput(artifact: Record<string, unknown>): Record<string, unknown> {
  const nestedOutput = asRecord(artifact.output);
  if (nestedOutput && looksLikeSolcOutput(nestedOutput)) {
    return nestedOutput;
  }
  return artifact;
}

function looksLikeSolcOutput(value: Record<string, unknown>): boolean {
  return Boolean(asRecord(value.sources) || asRecord(value.contracts));
}

function buildFileRegistry(output: Record<string, unknown>, sourceContents: Record<string, string>): SolidityFileRecord[] {
  const sources = asRecord(output.sources) ?? {};
  const inputSources = asRecord(asRecord(output.input)?.sources) ?? {};
  const records = Object.entries(sources).map(([filePath, value], fallbackIndex) => {
    const sourceRecord = asRecord(value) ?? {};
    const fileIndex = numberValue(sourceRecord.id) ?? fallbackIndex;
    const inputSource = asRecord(inputSources[filePath]);
    const content =
      sourceContents[filePath] ??
      stringValue(sourceRecord.content) ??
      stringValue(inputSource?.content);
    return {
      fileIndex,
      filePath,
      ...(content !== undefined ? { content } : {})
    };
  });

  return records.sort((a, b) => a.fileIndex - b.fileIndex);
}

function extractContract(filePath: string, node: SolcNode, registry: SolidityFileRegistry): ContractIr {
  const name = stringValue(node.name) ?? "UnknownContract";
  return {
    astId: numberValue(node.id),
    name,
    kind: stringValue(node.contractKind),
    fullyQualifiedName: `${filePath}:${name}`,
    filePath,
    sourceRange: registry.normalizeSolcSrc(node.src),
    inheritance: arrayValue(node.baseContracts)
      .map((base) => baseName(asRecord(base)))
      .filter((value): value is string => Boolean(value))
  };
}

function extractFunction(
  contractName: string,
  node: SolcNode,
  selectors: Map<string, string>,
  registry: SolidityFileRegistry
): FunctionIr {
  const kind = stringValue(node.kind) ?? "function";
  const rawName = stringValue(node.name);
  const name = rawName && rawName.length > 0 ? rawName : kind;
  const stateMutability = stringValue(node.stateMutability);
  return {
    astId: numberValue(node.id),
    contractName,
    name,
    canonicalName: `${contractName}.${name}`,
    kind,
    visibility: stringValue(node.visibility),
    stateMutability,
    payable: stateMutability === "payable",
    selector: selectors.get(name),
    modifiers: arrayValue(node.modifiers)
      .map((modifier) => stringValue(asRecord(asRecord(modifier)?.modifierName)?.name))
      .filter((value): value is string => Boolean(value)),
    filePath: registry.normalizeSolcSrc(node.src).filePath,
    sourceRange: registry.normalizeSolcSrc(node.src)
  };
}

function extractModifier(contractName: string, node: SolcNode, registry: SolidityFileRegistry): ModifierIr {
  const range = registry.normalizeSolcSrc(node.src);
  return {
    astId: numberValue(node.id),
    contractName,
    name: stringValue(node.name) ?? "unknownModifier",
    visibility: stringValue(node.visibility),
    filePath: range.filePath,
    sourceRange: range
  };
}

function extractEvent(contractName: string, node: SolcNode, registry: SolidityFileRegistry): EventIr {
  const range = registry.normalizeSolcSrc(node.src);
  return {
    astId: numberValue(node.id),
    contractName,
    name: stringValue(node.name) ?? "unknownEvent",
    anonymous: Boolean(node.anonymous),
    filePath: range.filePath,
    sourceRange: range
  };
}

function extractStateVariable(contractName: string, node: SolcNode, registry: SolidityFileRegistry): StateVariableIr {
  const range = registry.normalizeSolcSrc(node.src);
  const typeDescriptions = asRecord(node.typeDescriptions);
  return {
    astId: numberValue(node.id),
    contractName,
    name: stringValue(node.name) ?? "unknownVariable",
    typeName: stringValue(typeDescriptions?.typeString) ?? expressionToText(asRecord(node.typeName)),
    visibility: stringValue(node.visibility),
    constant: Boolean(node.constant),
    immutable: Boolean(node.mutability === "immutable"),
    filePath: range.filePath,
    sourceRange: range
  };
}

function extractCalls(
  contractName: string,
  functionName: string,
  root: SolcNode,
  registry: SolidityFileRegistry
): { edges: CallGraphEdgeIr[]; externalCalls: ExternalCallSiteIr[] } {
  const edges: CallGraphEdgeIr[] = [];
  const externalCalls: ExternalCallSiteIr[] = [];

  walk(root, (node) => {
    if (node.nodeType !== "FunctionCall") {
      return;
    }
    const expression = asRecord(node.expression);
    if (!expression) {
      return;
    }
    const range = registry.normalizeSolcSrc(node.src);
    const expressionText = expressionToText(expression);

    if (expression.nodeType === "Identifier") {
      edges.push({
        fromContract: contractName,
        fromFunction: functionName,
        toFunction: stringValue(expression.name),
        callKind: "INTERNAL",
        targetExpression: expressionText,
        filePath: range.filePath,
        sourceRange: range
      });
      return;
    }

    if (expression.nodeType !== "MemberAccess") {
      return;
    }

    const memberName = stringValue(expression.memberName);
    const callKind = externalCallKind(memberName);
    const valueTransfer = callKind === "TRANSFER" || callKind === "SEND" || hasValueCallOption(node);
    const lowLevel = ["CALL", "DELEGATECALL", "STATICCALL", "CALLCODE"].includes(callKind);
    edges.push({
      fromContract: contractName,
      fromFunction: functionName,
      toFunction: memberName,
      callKind: lowLevel ? "LOW_LEVEL" : callKind === "TRANSFER" ? "TRANSFER" : callKind === "SEND" ? "SEND" : "EXTERNAL",
      targetExpression: expressionText,
      filePath: range.filePath,
      sourceRange: range
    });
    externalCalls.push({
      contractName,
      functionName,
      callKind,
      targetExpression: expressionText,
      valueTransfer,
      lowLevel,
      confidence: lowLevel || valueTransfer ? 0.9 : 0.65,
      filePath: range.filePath,
      sourceRange: range
    });
  });

  return { edges, externalCalls };
}

function extractStorageLayout(contractName: string, contractOutput: Record<string, unknown>): StorageLayoutEntryIr[] {
  const storageLayout = asRecord(contractOutput.storageLayout);
  const storage = arrayValue(storageLayout?.storage);
  const types = asRecord(storageLayout?.types) ?? {};
  return storage.map((entry) => {
    const record = asRecord(entry) ?? {};
    const type = stringValue(record.type) ?? "unknown";
    const typeRecord = asRecord(types[type]) ?? {};
    return {
      contractName,
      astId: numberValue(record.astId),
      label: stringValue(record.label) ?? "unknown",
      slot: stringValue(record.slot) ?? String(numberValue(record.slot) ?? "0"),
      offset: numberValue(record.offset) ?? 0,
      type,
      encoding: stringValue(typeRecord.encoding),
      numberOfBytes: stringValue(typeRecord.numberOfBytes)
    };
  });
}

function extractSourceMaps(
  contractName: string,
  contractOutput: Record<string, unknown>,
  registry: SolidityFileRegistry
): SourceMapEntryIr[] {
  const entries: SourceMapEntryIr[] = [];
  const evm = asRecord(contractOutput.evm) ?? {};
  for (const artifact of ["bytecode", "deployedBytecode"] as const) {
    const sourceMap = stringValue(asRecord(evm[artifact])?.sourceMap);
    if (!sourceMap) {
      continue;
    }
    entries.push(...parseSourceMap(contractName, artifact, sourceMap, registry));
  }
  return entries;
}

function parseSourceMap(
  contractName: string,
  artifact: "bytecode" | "deployedBytecode",
  sourceMap: string,
  registry: SolidityFileRegistry
): SourceMapEntryIr[] {
  const current: Array<string | undefined> = [];
  return sourceMap.split(";").map((segment, instructionIndex) => {
    const parts = segment.split(":");
    for (let index = 0; index < parts.length; index += 1) {
      if (parts[index] !== "") {
        current[index] = parts[index];
      }
    }
    const offset = numberFromString(current[0]);
    const length = numberFromString(current[1]);
    const sourceIndex = numberFromString(current[2]);
    const src = offset !== undefined && length !== undefined && sourceIndex !== undefined
      ? `${offset}:${length}:${sourceIndex}`
      : undefined;
    const range = registry.normalizeSolcSrc(src);
    return {
      contractName,
      artifact,
      instructionIndex,
      sourceIndex,
      offset,
      length,
      jump: current[3],
      modifierDepth: numberFromString(current[4]),
      filePath: range.filePath,
      sourceRange: range
    };
  });
}

function methodSelectors(contractOutput: Record<string, unknown>): Map<string, string> {
  const selectors = new Map<string, string>();
  const methodIdentifiers = asRecord(asRecord(contractOutput.evm)?.methodIdentifiers) ?? {};
  for (const [signature, selector] of Object.entries(methodIdentifiers)) {
    const name = signature.split("(")[0];
    if (name && typeof selector === "string") {
      selectors.set(name, selector);
    }
  }
  return selectors;
}

function childNodes(node: SolcNode): SolcNode[] {
  return arrayValue(node.nodes).map((item) => asRecord(item)).filter((item): item is SolcNode => Boolean(item));
}

function walk(node: SolcNode, visit: (node: SolcNode) => void): void {
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) {
        const record = asRecord(child);
        if (record?.nodeType) {
          walk(record, visit);
        }
      }
    } else {
      const record = asRecord(value);
      if (record?.nodeType) {
        walk(record, visit);
      }
    }
  }
}

function expressionToText(node: SolcNode | undefined): string | undefined {
  if (!node) return undefined;
  switch (node.nodeType) {
    case "Identifier":
      return stringValue(node.name);
    case "MemberAccess": {
      const base = expressionToText(asRecord(node.expression));
      const member = stringValue(node.memberName);
      return [base, member].filter(Boolean).join(".");
    }
    case "FunctionCall":
      return expressionToText(asRecord(node.expression));
    case "ElementaryTypeNameExpression":
      return stringValue(asRecord(node.typeName)?.name);
    case "IndexAccess": {
      const base = expressionToText(asRecord(node.baseExpression));
      const index = expressionToText(asRecord(node.indexExpression));
      return `${base ?? ""}[${index ?? ""}]`;
    }
    default:
      return stringValue(node.name) ?? stringValue(node.typeString) ?? stringValue(node.nodeType);
  }
}

function externalCallKind(memberName: string | undefined): ExternalCallSiteIr["callKind"] {
  switch (memberName) {
    case "call":
      return "CALL";
    case "delegatecall":
      return "DELEGATECALL";
    case "staticcall":
      return "STATICCALL";
    case "callcode":
      return "CALLCODE";
    case "transfer":
      return "TRANSFER";
    case "send":
      return "SEND";
    default:
      return "EXTERNAL_CALL";
  }
}

function hasValueCallOption(functionCall: SolcNode): boolean {
  const options = arrayValue(functionCall.names).map((value) => stringValue(value));
  if (options.includes("value")) {
    return true;
  }
  const expression = asRecord(functionCall.expression);
  return expression?.nodeType === "FunctionCallOptions" && arrayValue(expression.names).some((value) => stringValue(value) === "value");
}

function baseName(base: SolcNode | undefined): string | undefined {
  const baseNameNode = asRecord(base?.baseName);
  return stringValue(baseNameNode?.name) ?? stringValue(baseNameNode?.namePath);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberFromString(value: string | undefined): number | undefined {
  if (value === undefined || value === "" || value === "-1") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function notAssessed(reason: string): AnalysisIr {
  return {
    status: "NOT_ASSESSED",
    reason,
    files: [],
    contracts: [],
    functions: [],
    modifiers: [],
    events: [],
    stateVariables: [],
    callGraphEdges: [],
    externalCallSites: [],
    storageLayout: [],
    sourceMaps: []
  };
}
