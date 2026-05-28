import type {
  AggregatedVulnerability,
  NormalizedConfidence,
  NormalizedFindingEvidence,
  NormalizedSeverity
} from "../normalization/types.js";
import { clampScore } from "../normalization/utils.js";

export type FindingConfidenceState =
  | "CANDIDATE"
  | "SUPPORTED"
  | "TRIAGED"
  | "SIMULATED"
  | "CONFIRMED"
  | "REJECTED"
  | "NOT_ASSESSED";

export interface FindingScoreInput {
  severity: NormalizedSeverity;
  confidence: NormalizedConfidence;
  analyzerCount: number;
  evidenceItems: NormalizedFindingEvidence[];
  hasTraceEvidence?: boolean | undefined;
}

export interface FindingScores {
  state: FindingConfidenceState;
  severityScore: number;
  confidenceScore: number;
  exploitabilityScore: number;
  priorityScore: number;
  evidenceQuality: number;
  reason: string;
}

const severityScore: Record<NormalizedSeverity, number> = {
  INFORMATIONAL: 5,
  LOW: 20,
  MEDIUM: 45,
  HIGH: 75,
  CRITICAL: 95
};

const confidenceScore: Record<NormalizedConfidence, number> = {
  LOW: 35,
  MEDIUM: 55,
  HIGH: 75,
  CONFIRMED: 85
};

export class FindingScoringService {
  score(input: FindingScoreInput): FindingScores {
    const quality = evidenceQuality(input.evidenceItems);
    const state = decisionState(input, quality);
    const severity = severityScore[input.severity];
    const confidence = clampScore(
      confidenceScore[input.confidence] +
        Math.min(10, Math.max(0, input.analyzerCount - 1) * 5) +
        quality * 0.15
    );
    const exploitability = exploitabilityScore(input, quality);
    const priority = clampScore(severity * 0.45 + confidence * 0.3 + exploitability * 0.25);

    return {
      state,
      severityScore: round(severity),
      confidenceScore: round(confidence),
      exploitabilityScore: round(exploitability),
      priorityScore: round(priority),
      evidenceQuality: round(quality),
      reason: reasonForState(state)
    };
  }

  scoreAggregate(vulnerability: AggregatedVulnerability): FindingScores {
    return this.score({
      severity: vulnerability.severity,
      confidence: vulnerability.confidence,
      analyzerCount: vulnerability.analyzerCount,
      evidenceItems: vulnerability.evidenceItems,
      hasTraceEvidence: vulnerability.evidenceItems.some((item) => item.evidenceType === "TRACE")
    });
  }
}

function evidenceQuality(evidenceItems: NormalizedFindingEvidence[]): number {
  if (evidenceItems.length === 0) {
    return 0;
  }

  const strongest = Math.max(...evidenceItems.map((item) => item.confidenceContribution * 100));
  const hasRange = evidenceItems.some((item) => Boolean(item.filePath && item.startLine));
  const hasSnippet = evidenceItems.some((item) => Boolean(item.snippet?.trim()));
  const hasTrace = evidenceItems.some((item) => item.evidenceType === "TRACE");
  const agreementBonus = Math.min(12, Math.max(0, evidenceItems.length - 1) * 3);

  return clampScore(
    strongest +
      (hasRange ? 12 : -10) +
      (hasSnippet ? 6 : 0) +
      (hasTrace ? 6 : 0) +
      agreementBonus
  );
}

function decisionState(input: FindingScoreInput, quality: number): FindingConfidenceState {
  if (input.evidenceItems.length === 0) {
    return "NOT_ASSESSED";
  }

  const hasRange = input.evidenceItems.some((item) => Boolean(item.filePath && item.startLine));
  if (!hasRange || quality < 45) {
    return "CANDIDATE";
  }

  return "SUPPORTED";
}

function exploitabilityScore(input: FindingScoreInput, quality: number): number {
  const baseBySeverity: Record<NormalizedSeverity, number> = {
    INFORMATIONAL: 5,
    LOW: 18,
    MEDIUM: 38,
    HIGH: 62,
    CRITICAL: 78
  };

  return clampScore(
    baseBySeverity[input.severity] +
      (input.hasTraceEvidence ? 8 : 0) +
      Math.min(10, Math.max(0, input.analyzerCount - 1) * 4) +
      (quality >= 70 ? 5 : 0)
  );
}

function reasonForState(state: FindingConfidenceState): string {
  switch (state) {
    case "SUPPORTED":
      return "Tool-backed evidence includes a concrete source range.";
    case "CANDIDATE":
      return "Tool-backed evidence is present but source range quality is incomplete.";
    case "NOT_ASSESSED":
      return "No assessed evidence was available for this finding.";
    case "TRIAGED":
    case "SIMULATED":
    case "CONFIRMED":
    case "REJECTED":
      return "State requires a later validation phase and is not assigned by P1 scoring.";
  }
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
