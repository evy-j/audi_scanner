import type { VulnerabilityNormalizationOutput } from "@audit-scanner/scanner-core";
import type { RiskScoreJobData } from "@audit-scanner/shared/queues/scan-jobs";
import type { RiskScoreResult, RiskScoringService } from "../scan-services.js";
import { LocalScannerArtifactStore } from "../scan-execution/local-artifact-store.js";

export class LocalRiskScoringService implements RiskScoringService {
  constructor(private readonly artifactStore = new LocalScannerArtifactStore()) {}

  async score(data: RiskScoreJobData, signal?: AbortSignal): Promise<RiskScoreResult> {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason));
    }

    if (data.normalizedArtifactKey) {
      const output = await this.readNormalizationOutput(data.normalizedArtifactKey);
      return {
        riskScore: calculateRiskScore(output, data.normalizationRiskScore),
        severityCounts: output.summary.severityCounts
      };
    }

    if (!data.severityCounts || typeof data.normalizationRiskScore !== "number") {
      throw new Error("Risk scoring requires normalized vulnerability output or normalization score");
    }

    return {
      riskScore: clampScore(data.normalizationRiskScore),
      severityCounts: data.severityCounts
    };
  }

  private async readNormalizationOutput(artifactKey: string): Promise<VulnerabilityNormalizationOutput> {
    const text = await this.artifactStore.readTextByArtifactKey(artifactKey);
    if (!text) {
      throw new Error(`Normalized vulnerability artifact was not found: ${artifactKey}`);
    }

    const parsed = JSON.parse(text) as VulnerabilityNormalizationOutput;
    if (parsed.schemaVersion !== "vulnerability-normalization/v1" || !Array.isArray(parsed.vulnerabilities)) {
      throw new Error(`Invalid normalized vulnerability artifact: ${artifactKey}`);
    }

    return parsed;
  }
}

function calculateRiskScore(
  output: VulnerabilityNormalizationOutput,
  normalizationRiskScore?: number | undefined
): number {
  const counts = output.summary.severityCounts;
  const severityPressure =
    counts.critical * 18 +
    counts.high * 10 +
    counts.medium * 5 +
    counts.low * 2 +
    counts.informational * 0.5;
  const density = Math.min(20, Math.log10(output.summary.uniqueVulnerabilities + 1) * 10);
  const aggregate = Math.max(
    output.summary.highestRiskScore,
    output.summary.averageRiskScore + severityPressure + density,
    normalizationRiskScore ?? 0
  );

  return clampScore(aggregate);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Number(score.toFixed(2))));
}
