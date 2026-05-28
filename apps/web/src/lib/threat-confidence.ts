import type { ThreatIntelConfidence, ThreatMatchStatus } from "@/types/api";

export function safeThreatConfidenceLabel(confidence?: ThreatIntelConfidence | string | null): ThreatIntelConfidence {
  switch (confidence) {
    case "LOW":
    case "MEDIUM":
    case "HIGH":
    case "VERIFIED":
    case "DISPUTED":
      return confidence;
    default:
      return "LOW";
  }
}

export function threatConfidenceBadgeVariant(confidence?: ThreatIntelConfidence | string | null): "red" | "amber" | "blue" | "default" | "neutral" {
  switch (confidence) {
    case "VERIFIED":
      return "default";
    case "HIGH":
      return "blue";
    case "MEDIUM":
      return "amber";
    case "DISPUTED":
      return "red";
    case "LOW":
    default:
      return "neutral";
  }
}

export function safeThreatMatchLabel(status?: ThreatMatchStatus | string | null): ThreatMatchStatus {
  switch (status) {
    case "MATCHED":
    case "PARTIAL":
    case "NOT_MATCHED":
    case "INCONCLUSIVE":
    case "NOT_ASSESSED":
      return status;
    default:
      return "NOT_ASSESSED";
  }
}
