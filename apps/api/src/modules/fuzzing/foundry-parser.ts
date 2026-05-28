import type { FuzzRunStatus, InvariantStatus } from "@prisma/client";
import { redactSecrets } from "../remediation/redaction.js";

export interface FoundryFuzzParseInput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean | undefined;
}

export interface FoundryFuzzParseResult {
  status: FuzzRunStatus;
  invariantStatus: InvariantStatus;
  summary: string;
  counterexample: string | null;
  gasUsed: bigint | null;
}

export interface CoverageParseResult {
  status: InvariantStatus;
  lineCoveragePct: number | null;
  functionCoveragePct: number | null;
  branchCoveragePct: number | null;
  rawSummary: string | null;
}

export function parseFoundryFuzzOutput(input: FoundryFuzzParseInput): FoundryFuzzParseResult {
  const output = redactSecrets(`${input.stdout}\n${input.stderr}`).slice(0, 80_000);
  const lower = output.toLowerCase();
  const counterexample = extractCounterexample(output);
  const gasUsed = extractGasUsed(output);

  if (input.timedOut) {
    return result("TIMEOUT", "INCONCLUSIVE", "Foundry fuzz execution timed out.", counterexample, gasUsed);
  }

  if (counterexample && /counterexample|falsified|invariant.*fail|test.*fail|fail:/iu.test(output)) {
    return result("FAILED", "FAILED", "Foundry output contains a real failure or counterexample.", counterexample, gasUsed);
  }

  if (input.exitCode === 0 && /suite result:\s*ok|test result:\s*ok|^\s*pass/imu.test(output)) {
    return result("PASSED", "PASSED", "Foundry output reports passing tests.", null, gasUsed);
  }

  if (input.exitCode !== 0 && /fail|error|revert|panic/iu.test(output)) {
    return result("FAILED", counterexample ? "FAILED" : "INCONCLUSIVE", "Foundry exited non-zero; no invariant failure is trusted unless a counterexample is present.", counterexample, gasUsed);
  }

  return result("INCONCLUSIVE", "INCONCLUSIVE", "Foundry output did not contain a trusted pass/fail signal.", counterexample, gasUsed);
}

export function parseCoverageSummary(output: string): CoverageParseResult {
  const redacted = redactSecrets(output).slice(0, 80_000);
  const totalLine = redacted.split(/\r?\n/u).find((line) => /^\s*(total|all files)\b/iu.test(line));
  if (!totalLine) {
    return { status: "NOT_ASSESSED", lineCoveragePct: null, functionCoveragePct: null, branchCoveragePct: null, rawSummary: null };
  }

  const percentages = [...totalLine.matchAll(/(\d+(?:\.\d+)?)%/gu)].map((match) => Number(match[1]));
  if (percentages.length === 0) {
    return { status: "INCONCLUSIVE", lineCoveragePct: null, functionCoveragePct: null, branchCoveragePct: null, rawSummary: totalLine.trim() };
  }

  return {
    status: "PASSED",
    lineCoveragePct: percentages[0] ?? null,
    functionCoveragePct: percentages.at(-1) ?? null,
    branchCoveragePct: percentages.length > 2 ? percentages[2] ?? null : null,
    rawSummary: totalLine.trim()
  };
}

function result(
  status: FuzzRunStatus,
  invariantStatus: InvariantStatus,
  summary: string,
  counterexample: string | null,
  gasUsed: bigint | null
): FoundryFuzzParseResult {
  return { status, invariantStatus, summary, counterexample, gasUsed };
}

function extractCounterexample(output: string): string | null {
  const lines = output.split(/\r?\n/u);
  const start = lines.findIndex((line) => /counterexample|falsified|calldata|args:/iu.test(line));
  if (start < 0) return null;
  return redactSecrets(lines.slice(Math.max(0, start - 2), start + 10).join("\n")).slice(0, 4_000);
}

function extractGasUsed(output: string): bigint | null {
  const match = /gas(?:\s+used)?[:=]\s*([0-9][0-9_,]*)/iu.exec(output);
  if (!match) return null;
  try {
    return BigInt(match[1]!.replace(/[_ ,]/gu, ""));
  } catch {
    return null;
  }
}
