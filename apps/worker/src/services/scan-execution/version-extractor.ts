import type { AnalyzerName } from "@audit-scanner/shared/queues/scan-jobs";

export function extractAnalyzerVersion(analyzer: AnalyzerName, rawOutput: unknown): string {
  if (rawOutput && typeof rawOutput === "object") {
    const record = rawOutput as Record<string, unknown>;

    if (typeof record.version === "string") {
      return record.version;
    }

    if (typeof record.semgrep_version === "string") {
      return record.semgrep_version;
    }

    const meta = record.meta;
    if (meta && typeof meta === "object") {
      const metaRecord = meta as Record<string, unknown>;
      if (typeof metaRecord.version === "string") {
        return metaRecord.version;
      }
    }
  }

  return `${analyzer}:unknown`;
}
