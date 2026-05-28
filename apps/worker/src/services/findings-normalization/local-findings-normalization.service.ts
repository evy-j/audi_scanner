import {
  VulnerabilityNormalizationService,
  type AnalyzerName,
  type AnalyzerNormalizationInput
} from "@audit-scanner/scanner-core";
import type {
  FindingsNormalizationResult,
  FindingsNormalizationService
} from "../scan-services.js";
import type { FindingsNormalizeJobData } from "@audit-scanner/shared/queues/scan-jobs";
import { LocalScannerArtifactStore } from "../scan-execution/local-artifact-store.js";
import { sanitizePathSegment } from "../scan-execution/safe-path.js";
import { ScanPersistenceService } from "../../persistence/scan-persistence.service.js";
import { AnalysisIrPersistenceService } from "../analysis-ir/analysis-ir-persistence.service.js";

export class LocalFindingsNormalizationService implements FindingsNormalizationService {
  constructor(
    private readonly artifactStore = new LocalScannerArtifactStore(),
    private readonly normalizationService = new VulnerabilityNormalizationService(),
    private readonly persistence = new ScanPersistenceService(artifactStore),
    private readonly analysisIr = new AnalysisIrPersistenceService(artifactStore)
  ) {}

  async normalize(data: FindingsNormalizeJobData, signal?: AbortSignal): Promise<FindingsNormalizationResult> {
    const analyzerInputs: AnalyzerNormalizationInput[] = [];

    for (const artifactKey of data.analyzerArtifactKeys) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason));
      }

      const analyzer = getAnalyzerFromArtifactKey(artifactKey);
      if (!analyzer) {
        continue;
      }

      const artifactText = await this.artifactStore.readTextByArtifactKey(artifactKey);
      if (!artifactText) {
        throw new Error(`Analyzer artifact was not found: ${artifactKey}`);
      }

      analyzerInputs.push({
        analyzer,
        analyzerVersion: "unknown",
        artifactKey,
        rawOutput: parseAnalyzerArtifact(artifactKey, artifactText)
      });
    }

    const output = this.normalizationService.normalize({
      scanId: data.scanId,
      organizationId: data.organizationId,
      analyzers: analyzerInputs
    });
    const artifactPrefix = `normalization/${sanitizePathSegment(data.scanId)}`;
    const normalizedArtifactKey = await this.artifactStore.writeJsonArtifact(
      artifactPrefix,
      "vulnerabilities.json",
      output
    );
    const persistedVulnerabilityCount = await this.persistence.persistNormalizedVulnerabilities(output);
    await this.analysisIr.persistForScan(data.scanId, data.organizationId);

    return {
      vulnerabilityCount: persistedVulnerabilityCount,
      normalizedArtifactKey,
      riskScore: output.summary.highestRiskScore,
      severityCounts: output.summary.severityCounts
    };
  }
}

function parseAnalyzerArtifact(artifactKey: string, artifactText: string): unknown {
  try {
    return JSON.parse(artifactText) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Analyzer artifact is not valid JSON: ${artifactKey}: ${message}`);
  }
}

function getAnalyzerFromArtifactKey(artifactKey: string): AnalyzerName | null {
  const normalized = artifactKey.replace(/\\/g, "/");
  const match = normalized.match(/scanner-runs\/[^/]+\/([^/]+)\//);
  const candidate = match?.[1];

  if (candidate === "slither" || candidate === "mythril" || candidate === "semgrep" || candidate === "aderyn") {
    return candidate;
  }

  return null;
}
