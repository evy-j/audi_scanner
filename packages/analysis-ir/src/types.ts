export type ExtractionStatus = "EXTRACTED" | "PARTIAL" | "NOT_ASSESSED" | "FAILED";

export interface SourceRange {
  filePath?: string | undefined;
  startOffset?: number | undefined;
  length?: number | undefined;
  startLine?: number | undefined;
  startColumn?: number | undefined;
  endLine?: number | undefined;
  endColumn?: number | undefined;
  status: ExtractionStatus;
}

export interface SolidityFileRecord {
  fileIndex: number;
  filePath: string;
  content?: string | undefined;
}

export interface ContractIr {
  astId?: number | undefined;
  name: string;
  kind?: string | undefined;
  fullyQualifiedName: string;
  filePath?: string | undefined;
  sourceRange: SourceRange;
  inheritance: string[];
}

export interface FunctionIr {
  astId?: number | undefined;
  contractName: string;
  name: string;
  canonicalName: string;
  kind?: string | undefined;
  visibility?: string | undefined;
  stateMutability?: string | undefined;
  payable: boolean;
  selector?: string | undefined;
  modifiers: string[];
  filePath?: string | undefined;
  sourceRange: SourceRange;
}

export interface ModifierIr {
  astId?: number | undefined;
  contractName: string;
  name: string;
  visibility?: string | undefined;
  filePath?: string | undefined;
  sourceRange: SourceRange;
}

export interface EventIr {
  astId?: number | undefined;
  contractName: string;
  name: string;
  anonymous: boolean;
  filePath?: string | undefined;
  sourceRange: SourceRange;
}

export interface StateVariableIr {
  astId?: number | undefined;
  contractName: string;
  name: string;
  typeName?: string | undefined;
  visibility?: string | undefined;
  constant: boolean;
  immutable: boolean;
  filePath?: string | undefined;
  sourceRange: SourceRange;
}

export interface CallGraphEdgeIr {
  fromContract: string;
  fromFunction: string;
  toContract?: string | undefined;
  toFunction?: string | undefined;
  callKind: "INTERNAL" | "EXTERNAL" | "LOW_LEVEL" | "TRANSFER" | "SEND" | "EVENT";
  targetExpression?: string | undefined;
  filePath?: string | undefined;
  sourceRange: SourceRange;
}

export interface ExternalCallSiteIr {
  contractName: string;
  functionName: string;
  callKind: "CALL" | "DELEGATECALL" | "STATICCALL" | "CALLCODE" | "TRANSFER" | "SEND" | "EXTERNAL_CALL";
  targetExpression?: string | undefined;
  valueTransfer: boolean;
  lowLevel: boolean;
  confidence: number;
  filePath?: string | undefined;
  sourceRange: SourceRange;
}

export interface StorageLayoutEntryIr {
  contractName: string;
  astId?: number | undefined;
  label: string;
  slot: string;
  offset: number;
  type: string;
  encoding?: string | undefined;
  numberOfBytes?: string | undefined;
}

export interface SourceMapEntryIr {
  contractName: string;
  artifact: "bytecode" | "deployedBytecode";
  instructionIndex: number;
  sourceIndex?: number | undefined;
  offset?: number | undefined;
  length?: number | undefined;
  jump?: string | undefined;
  modifierDepth?: number | undefined;
  filePath?: string | undefined;
  sourceRange: SourceRange;
}

export interface AnalysisIr {
  status: ExtractionStatus;
  reason?: string | undefined;
  files: SolidityFileRecord[];
  contracts: ContractIr[];
  functions: FunctionIr[];
  modifiers: ModifierIr[];
  events: EventIr[];
  stateVariables: StateVariableIr[];
  callGraphEdges: CallGraphEdgeIr[];
  externalCallSites: ExternalCallSiteIr[];
  storageLayout: StorageLayoutEntryIr[];
  sourceMaps: SourceMapEntryIr[];
}
