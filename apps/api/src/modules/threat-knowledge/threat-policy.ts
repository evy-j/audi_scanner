import { ApiError } from "../../common/errors/api-error.js";

export const THREAT_KNOWLEDGE_SAFETY_POLICY = {
  mode: "DEFENSIVE_KNOWLEDGE_BASE",
  requiresProvenance: true,
  noExploitInstructions: true,
  noAutonomousAttackAgents: true,
  noLiveAttackExecution: true,
  noTransactionBroadcast: true,
  noFabricatedThreatIntel: true,
  noDefamatoryIdentityClaims: true,
  signatureMatchesDoNotConfirmFindings: true,
  signatureMatchesSuggestReviewPriorityOnly: true
} as const;

const exploitInstructionPatterns = [
  /\bprivate\s+key\b/i,
  /\bseed\s+phrase\b/i,
  /\bmnemonic\b/i,
  /\brunnable\s+exploit\b/i,
  /\bstep[-\s]?by[-\s]?step\s+exploit\b/i,
  /\bdeploy\s+the\s+exploit\b/i,
  /\battack\s+script\b/i,
  /\bdrain\s+(funds|liquidity|wallets?)\b/i,
  /\bsteal\s+(funds|tokens?|assets?)\b/i,
  /\bcast\s+send\b/i,
  /\bforge\s+script\b/i,
  /\bexploit\s+contract\b/i,
  /\b0x[a-fA-F0-9]{64}\b/
];

const defamatoryLabelPatterns = [
  /\bscammer\b/i,
  /\bhacker\b/i,
  /\bcriminal\b/i,
  /\bfraudster\b/i,
  /\bterrorist\b/i,
  /\bthief\b/i
];

export interface ProvenanceInput {
  provenanceUrl?: string | null | undefined;
  provenanceHash?: string | null | undefined;
  provenanceReference?: string | null | undefined;
  sourceId?: string | null | undefined;
}

export function hasProvenance(input: ProvenanceInput): boolean {
  return Boolean(
    nonEmpty(input.provenanceUrl) ||
    nonEmpty(input.provenanceHash) ||
    nonEmpty(input.provenanceReference) ||
    nonEmpty(input.sourceId)
  );
}

export function assertHasProvenance(input: ProvenanceInput, subject: string): void {
  if (!hasProvenance(input)) {
    throw ApiError.badRequest(`${subject} requires provenance`);
  }
}

export function assertNoExploitInstructions(input: unknown): void {
  const strings = collectStrings(input);
  const matched = strings.find((value) => exploitInstructionPatterns.some((pattern) => pattern.test(value)));
  if (matched) {
    throw ApiError.badRequest("Threat knowledge payload contains unsafe exploit-instruction-like content");
  }
}

export function assertSafeWalletOrContractLabel(label: string): void {
  if (defamatoryLabelPatterns.some((pattern) => pattern.test(label))) {
    throw ApiError.badRequest("Risk labels must avoid defamatory wallet or person identity claims");
  }
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function collectStrings(input: unknown): string[] {
  if (typeof input === "string") return [input];
  if (!input || typeof input !== "object") return [];
  if (Array.isArray(input)) return input.flatMap((item) => collectStrings(item));
  return Object.values(input as Record<string, unknown>).flatMap((value) => collectStrings(value));
}
