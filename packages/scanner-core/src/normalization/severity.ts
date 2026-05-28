import type { NormalizedConfidence, NormalizedSeverity } from "./types.js";

export const severityRank: Record<NormalizedSeverity, number> = {
  INFORMATIONAL: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4
};

export const confidenceRank: Record<NormalizedConfidence, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CONFIRMED: 3
};

export function normalizeSeverity(value: unknown): NormalizedSeverity {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (["critical", "blocker"].includes(normalized)) {
    return "CRITICAL";
  }
  if (["high", "error"].includes(normalized)) {
    return "HIGH";
  }
  if (["medium", "warning", "moderate"].includes(normalized)) {
    return "MEDIUM";
  }
  if (["low", "optimization"].includes(normalized)) {
    return "LOW";
  }

  return "INFORMATIONAL";
}

export function normalizeConfidence(value: unknown): NormalizedConfidence {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (["confirmed", "very-high", "very_high"].includes(normalized)) {
    return "CONFIRMED";
  }
  if (["high", "strong"].includes(normalized)) {
    return "HIGH";
  }
  if (["medium", "moderate"].includes(normalized)) {
    return "MEDIUM";
  }

  return "LOW";
}

export function maxSeverity(values: NormalizedSeverity[]): NormalizedSeverity {
  return values.reduce(
    (max, value) => (severityRank[value] > severityRank[max] ? value : max),
    "INFORMATIONAL" as NormalizedSeverity
  );
}

export function maxConfidence(values: NormalizedConfidence[]): NormalizedConfidence {
  return values.reduce(
    (max, value) => (confidenceRank[value] > confidenceRank[max] ? value : max),
    "LOW" as NormalizedConfidence
  );
}

export function combineConfidence(
  values: NormalizedConfidence[],
  analyzerCount: number
): NormalizedConfidence {
  const highest = maxConfidence(values);

  if (analyzerCount >= 3 && confidenceRank[highest] >= confidenceRank.MEDIUM) {
    return "CONFIRMED";
  }
  if (analyzerCount >= 2 && highest === "MEDIUM") {
    return "HIGH";
  }

  return highest;
}
