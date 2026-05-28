import type {
  AnalyzerNormalizationInput,
  AnalyzerOutputNormalizer,
  NormalizedFinding,
  SourceLocation
} from "../types.js";
import { createDedupeKey, createFindingFingerprint } from "../fingerprint.js";
import { normalizeConfidence, normalizeSeverity } from "../severity.js";
import { classifyCategory, mergeTaxonomy } from "../taxonomy.js";
import { asArray, asNumber, asRecord, asString, titleCaseIdentifier } from "../utils.js";

export class AderynOutputNormalizer implements AnalyzerOutputNormalizer {
  supports(analyzer: string): boolean {
    return analyzer === "aderyn";
  }

  normalize(input: AnalyzerNormalizationInput): NormalizedFinding[] {
    const raw = asRecord(input.rawOutput) ?? {};
    const issues = [
      ...asArray(raw.issues),
      ...asArray(raw.findings),
      ...asArray(raw.detectors),
      ...asArray(raw.results)
    ];

    return issues.map((issue, index) => this.normalizeIssue(input, issue, index));
  }

  private normalizeIssue(
    input: AnalyzerNormalizationInput,
    issue: unknown,
    index: number
  ): NormalizedFinding {
    const record = asRecord(issue) ?? {};
    const ruleId =
      asString(record.detector) ??
      asString(record.rule_id) ??
      asString(record.ruleId) ??
      asString(record.check) ??
      `aderyn-issue-${index}`;
    const title =
      asString(record.title) ??
      asString(record.name) ??
      titleCaseIdentifier(ruleId);
    const description =
      asString(record.description) ??
      asString(record.message) ??
      asString(record.issue) ??
      title;
    const location = getAderynLocation(record);
    const category = classifyCategory({
      ruleId,
      title,
      description,
      metadata: record
    });
    const taxonomy = mergeTaxonomy({
      category,
      rawCwe: record.cwe,
      rawSwc: record.swc,
      rawOwasp: record.owasp
    });
    const severity = normalizeSeverity(record.severity ?? record.impact);
    const confidence = normalizeConfidence(record.confidence);
    const fingerprint = createFindingFingerprint({
      analyzer: input.analyzer,
      ruleId,
      category,
      location,
      title
    });
    const dedupeKey = createDedupeKey({ category, location, ruleId, title });

    return {
      id: `aderyn-${fingerprint.slice(0, 16)}`,
      analyzer: "aderyn",
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
        code: asString(record.snippet) ?? asString(record.code),
        raw: issue
      },
      evidenceItems: [
        {
          evidenceType: "ANALYZER",
          analyzer: "aderyn",
          toolName: "aderyn",
          filePath: location.filePath,
          startLine: location.lineStart,
          endLine: location.lineEnd,
          startColumn: location.columnStart,
          endColumn: location.columnEnd,
          snippet: asString(record.snippet) ?? asString(record.code),
          ruleId,
          detectorName: ruleId,
          message: description,
          confidenceContribution: location.filePath && location.lineStart ? 0.74 : 0.44,
          rawArtifactPath: input.artifactKey,
          raw: issue
        }
      ],
      remediation: asString(record.recommendation) ?? asString(record.remediation) ?? taxonomy.remediation,
      references: [],
      fingerprint,
      dedupeKey,
      raw: issue
    };
  }
}

function getAderynLocation(record: Record<string, unknown>): SourceLocation {
  const location = asRecord(record.location) ?? asRecord(record.source) ?? {};
  return {
    filePath:
      asString(record.file) ??
      asString(record.filename) ??
      asString(record.file_path) ??
      asString(location.file) ??
      asString(location.filename),
    contractName: asString(record.contract) ?? asString(location.contract),
    functionName: asString(record.function) ?? asString(location.function),
    lineStart:
      asNumber(record.line) ??
      asNumber(record.line_start) ??
      asNumber(record.startLine) ??
      asNumber(location.line) ??
      asNumber(location.line_start),
    lineEnd:
      asNumber(record.line_end) ??
      asNumber(record.endLine) ??
      asNumber(location.line_end),
    columnStart:
      asNumber(record.column) ??
      asNumber(record.column_start) ??
      asNumber(record.startColumn) ??
      asNumber(location.column),
    columnEnd:
      asNumber(record.column_end) ??
      asNumber(record.endColumn) ??
      asNumber(location.column_end)
  };
}
