import type {
  AggregatedVulnerability,
  NormalizedConfidence,
  NormalizedFinding,
  NormalizedSeverity,
  SeverityCounts,
  VulnerabilityCategory
} from "./types.js";
import { clampScore } from "./utils.js";

const severityBaseScore: Record<NormalizedSeverity, number> = {
  INFORMATIONAL: 5,
  LOW: 20,
  MEDIUM: 45,
  HIGH: 75,
  CRITICAL: 95
};

const confidenceMultiplier: Record<NormalizedConfidence, number> = {
  LOW: 0.75,
  MEDIUM: 0.9,
  HIGH: 1,
  CONFIRMED: 1.08
};

const categoryModifier: Record<VulnerabilityCategory, number> = {
  REENTRANCY: 8,
  INTEGER_OVERFLOW: 4,
  TX_ORIGIN: 5,
  ACCESS_CONTROL: 10,
  DELEGATECALL: 8,
  ORACLE_MANIPULATION: 10,
  FLASH_LOAN: 10,
  SELFDESTRUCT: 8,
  UPGRADEABILITY: 8,
  UNSAFE_EXTERNAL_CALL: 4,
  HONEYPOT: 7,
  RUG_PULL: 9,
  SUSPICIOUS_OWNERSHIP: 5,
  GAS_OPTIMIZATION: -8,
  INSECURE_RANDOMNESS: 5,
  DENIAL_OF_SERVICE: 6,
  BUSINESS_LOGIC: 7,
  OTHER: 0
};

export function scoreFinding(finding: NormalizedFinding): number {
  const base = severityBaseScore[finding.severity];
  const confidence = confidenceMultiplier[finding.confidence];
  const category = categoryModifier[finding.category];
  const locationBonus = finding.location.filePath ? 2 : 0;

  return clampScore(base * confidence + category + locationBonus);
}

export function scoreAggregate(input: {
  severity: NormalizedSeverity;
  confidence: NormalizedConfidence;
  category: VulnerabilityCategory;
  analyzerCount: number;
  findingScores: number[];
}): number {
  const strongestFindingScore = Math.max(...input.findingScores, 0);
  const agreementBonus = Math.min(10, Math.max(0, input.analyzerCount - 1) * 5);
  const category = categoryModifier[input.category];
  const base = Math.max(
    strongestFindingScore,
    severityBaseScore[input.severity] * confidenceMultiplier[input.confidence] + category
  );

  return clampScore(base + agreementBonus);
}

export function countSeverities(
  vulnerabilities: Pick<AggregatedVulnerability, "severity">[]
): SeverityCounts {
  return vulnerabilities.reduce<SeverityCounts>(
    (counts, vulnerability) => {
      switch (vulnerability.severity) {
        case "CRITICAL":
          counts.critical += 1;
          break;
        case "HIGH":
          counts.high += 1;
          break;
        case "MEDIUM":
          counts.medium += 1;
          break;
        case "LOW":
          counts.low += 1;
          break;
        case "INFORMATIONAL":
          counts.informational += 1;
          break;
      }

      return counts;
    },
    {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0
    }
  );
}
