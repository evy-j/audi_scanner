import type {
  AnalyzerNormalizationInput,
  AnalyzerOutputNormalizer,
  NormalizedConfidence,
  NormalizedFinding,
  SourceLocation
} from "../types.js";
import { createDedupeKey, createFindingFingerprint } from "../fingerprint.js";
import { normalizeSeverity } from "../severity.js";
import { classifyCategory, mergeTaxonomy } from "../taxonomy.js";
import { asArray, asNumber, asRecord, asString, titleCaseIdentifier } from "../utils.js";

export class MythrilOutputNormalizer implements AnalyzerOutputNormalizer {
  supports(analyzer: string): boolean {
    return analyzer === "mythril";
  }

  normalize(input: AnalyzerNormalizationInput): NormalizedFinding[] {
    const raw = asRecord(input.rawOutput);
    const issues = asArray(raw?.issues);

    return issues.map((issue, index) => this.normalizeIssue(input, issue, index));
  }

  private normalizeIssue(
    input: AnalyzerNormalizationInput,
    issue: unknown,
    index: number
  ): NormalizedFinding {
    const record = asRecord(issue) ?? {};
    const swcIds = extractSwcIds(record);
    const ruleId = swcIds[0] ?? asString(record.swcID) ?? asString(record.swc_id) ?? `mythril-issue-${index}`;
    const title =
      asString(record.title) ??
      asString(record.name) ??
      titleCaseIdentifier(ruleId);
    const description =
      asString(record.description) ??
      asString(record.description_head) ??
      asString(record.description_tail) ??
      title;
    const location = getMythrilLocation(record);
    const category = classifyCategory({
      ruleId,
      title,
      description,
      swcIds,
      metadata: record
    });
    const taxonomy = mergeTaxonomy({
      category,
      rawCwe: record.cwe,
      rawSwc: swcIds,
      rawOwasp: record.owasp
    });
    const severity = normalizeSeverity(record.severity);
    const confidence = getMythrilConfidence(record);
    const fingerprint = createFindingFingerprint({
      analyzer: input.analyzer,
      ruleId,
      category,
      location,
      title
    });
    const dedupeKey = createDedupeKey({ category, location, ruleId, title });

    return {
      id: `mythril-${fingerprint.slice(0, 16)}`,
      analyzer: "mythril",
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
        code: asString(record.code),
        trace: record.tx_sequence,
        raw: issue
      },
      evidenceItems: [
        {
          evidenceType: "ANALYZER",
          analyzer: "mythril",
          toolName: "mythril",
          filePath: location.filePath,
          startLine: location.lineStart,
          endLine: location.lineEnd,
          startColumn: location.columnStart,
          endColumn: location.columnEnd,
          snippet: asString(record.code),
          ruleId,
          detectorName: ruleId,
          message: description,
          confidenceContribution: location.filePath && location.lineStart ? 0.76 : 0.46,
          rawArtifactPath: input.artifactKey,
          raw: issue
        },
        ...(Array.isArray(record.tx_sequence) && record.tx_sequence.length > 0
          ? [
              {
                evidenceType: "TRACE" as const,
                analyzer: "mythril" as const,
                toolName: "mythril",
                filePath: location.filePath,
                startLine: location.lineStart,
                endLine: location.lineEnd,
                ruleId,
                detectorName: ruleId,
                message: "Mythril symbolic transaction sequence",
                confidenceContribution: 0.12,
                rawArtifactPath: input.artifactKey,
                raw: record.tx_sequence
              }
            ]
          : [])
      ],
      remediation: taxonomy.remediation,
      references: [],
      fingerprint,
      dedupeKey,
      raw: issue
    };
  }
}

function getMythrilLocation(record: Record<string, unknown>): SourceLocation {
  const sourceMap = asRecord(record.sourceMap) ?? asRecord(record.source_map) ?? {};
  const line = asNumber(record.lineno) ?? asNumber(record.line) ?? asNumber(sourceMap.line);

  return {
    filePath:
      asString(record.filename) ??
      asString(record.file) ??
      asString(sourceMap.filename) ??
      asString(sourceMap.file),
    contractName: asString(record.contract),
    functionName: asString(record.function),
    lineStart: line,
    lineEnd: line,
    columnStart: asNumber(record.column) ?? asNumber(sourceMap.column)
  };
}

function extractSwcIds(record: Record<string, unknown>): string[] {
  const values = [
    record["swc-id"],
    record.swcID,
    record.swc_id,
    record.swc
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => asString(value))
    .filter((value): value is string => Boolean(value))
    .map((value) => (value.startsWith("SWC-") ? value : `SWC-${value}`))
    .map((value) => value.toUpperCase());

  return Array.from(new Set(values)).sort();
}

function getMythrilConfidence(record: Record<string, unknown>): NormalizedConfidence {
  if (asString(record.confidence)) {
    const value = asString(record.confidence)?.toLowerCase();
    if (value === "high") {
      return "HIGH";
    }
    if (value === "confirmed") {
      return "CONFIRMED";
    }
    if (value === "medium") {
      return "MEDIUM";
    }
    return "LOW";
  }

  return Array.isArray(record.tx_sequence) && record.tx_sequence.length > 0 ? "HIGH" : "MEDIUM";
}
