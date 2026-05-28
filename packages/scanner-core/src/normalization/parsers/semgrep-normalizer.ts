import type {
  AnalyzerNormalizationInput,
  AnalyzerOutputNormalizer,
  NormalizedFinding,
  SourceLocation
} from "../types.js";
import { createDedupeKey, createFindingFingerprint } from "../fingerprint.js";
import { normalizeConfidence, normalizeSeverity } from "../severity.js";
import { classifyCategory, mergeTaxonomy } from "../taxonomy.js";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  titleCaseIdentifier,
  uniqueSorted
} from "../utils.js";

export class SemgrepOutputNormalizer implements AnalyzerOutputNormalizer {
  supports(analyzer: string): boolean {
    return analyzer === "semgrep";
  }

  normalize(input: AnalyzerNormalizationInput): NormalizedFinding[] {
    const raw = asRecord(input.rawOutput);
    const results = asArray(raw?.results);

    return results.map((result, index) => this.normalizeResult(input, result, index));
  }

  private normalizeResult(
    input: AnalyzerNormalizationInput,
    result: unknown,
    index: number
  ): NormalizedFinding {
    const record = asRecord(result) ?? {};
    const extra = asRecord(record.extra) ?? {};
    const metadata = asRecord(extra.metadata) ?? {};
    const ruleId = asString(record.check_id) ?? `semgrep-result-${index}`;
    const title = asString(metadata.name) ?? titleCaseIdentifier(ruleId);
    const description = asString(extra.message) ?? title;
    const location = getSemgrepLocation(record);
    const category = classifyCategory({
      ruleId,
      title,
      description,
      metadata
    });
    const taxonomy = mergeTaxonomy({
      category,
      rawCwe: metadata.cwe,
      rawSwc: metadata.swc,
      rawOwasp: metadata.owasp
    });
    const severity = normalizeSeverity(
      metadata.severity ?? metadata.impact ?? extra.severity
    );
    const confidence = normalizeConfidence(metadata.confidence);
    const fingerprint = createFindingFingerprint({
      analyzer: input.analyzer,
      ruleId,
      category,
      location,
      title
    });
    const dedupeKey = createDedupeKey({ category, location, ruleId, title });

    return {
      id: `semgrep-${fingerprint.slice(0, 16)}`,
      analyzer: "semgrep",
      analyzerVersion: input.analyzerVersion,
      artifactKey: input.artifactKey,
      ruleId,
      title,
      description,
      category,
      severity,
      confidence,
      cweIds: taxonomy.cweIds,
      swcIds: taxonomy.swcIds,
      owaspSmartContractTop10: taxonomy.owaspSmartContractTop10,
      owaspWebTop10: taxonomy.owaspWebTop10,
      location,
      evidence: {
        summary: description,
        code: asString(extra.lines),
        raw: result
      },
      evidenceItems: [
        {
          evidenceType: "ANALYZER",
          analyzer: "semgrep",
          toolName: "semgrep",
          filePath: location.filePath,
          startLine: location.lineStart,
          endLine: location.lineEnd,
          startColumn: location.columnStart,
          endColumn: location.columnEnd,
          snippet: asString(extra.lines),
          ruleId,
          detectorName: ruleId,
          message: description,
          confidenceContribution: location.filePath && location.lineStart ? 0.78 : 0.48,
          rawArtifactPath: input.artifactKey,
          raw: result
        }
      ],
      remediation: asString(extra.fix) ?? taxonomy.remediation,
      references: getSemgrepReferences(metadata),
      fingerprint: asString(extra.fingerprint) ?? fingerprint,
      dedupeKey,
      raw: result
    };
  }
}

function getSemgrepLocation(record: Record<string, unknown>): SourceLocation {
  const start = asRecord(record.start) ?? {};
  const end = asRecord(record.end) ?? {};

  return {
    filePath: asString(record.path),
    lineStart: asNumber(start.line),
    lineEnd: asNumber(end.line),
    columnStart: asNumber(start.col),
    columnEnd: asNumber(end.col)
  };
}

function getSemgrepReferences(metadata: Record<string, unknown>): string[] {
  return uniqueSorted([
    ...asArray(metadata.references)
      .map((value) => asString(value))
      .filter((value): value is string => Boolean(value)),
    asString(metadata.source),
    asString(metadata.shortlink),
    asString(metadata["semgrep.url"])
  ].filter((value): value is string => Boolean(value)));
}
