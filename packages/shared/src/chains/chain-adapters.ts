export type ExplorerFetchStatus =
  | "QUEUED"
  | "RUNNING"
  | "VERIFIED"
  | "NOT_VERIFIED"
  | "FAILED"
  | "PROVIDER_NOT_CONFIGURED"
  | "RATE_LIMITED"
  | "NOT_ASSESSED";

export interface ContractVerificationSummary {
  chainId: string;
  address: string;
  normalizedAddress: string;
  status: ExplorerFetchStatus;
  contractName?: string | null;
  compilerVersion?: string | null;
  sourceArtifactId?: string | null;
  abiAvailable: boolean;
  explorerProvider?: string | null;
  sourceProvenance: "EXPLORER_VERIFIED_SOURCE" | "NONE";
  limitations: string[];
}
