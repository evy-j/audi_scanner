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
  titleCaseIdentifier
} from "../utils.js";

export class SlitherOutputNormalizer implements AnalyzerOutputNormalizer {
  supports(analyzer: string): boolean {
    return analyzer === "slither";
  }

  normalize(input: AnalyzerNormalizationInput): NormalizedFinding[] {
    const raw = asRecord(input.rawOutput);
    const results = asRecord(raw?.results);
    const detectors = asArray(results?.detectors);

    return detectors.map((detector, index) => this.normalizeDetector(input, detector, index));
  }

  private normalizeDetector(
    input: AnalyzerNormalizationInput,
    detector: unknown,
    index: number
  ): NormalizedFinding {
    const record = asRecord(detector) ?? {};
    const ruleId = asString(record.check) ?? `slither-detector-${index}`;
    const title = titleCaseIdentifier(ruleId);
    const description = asString(record.description) ?? title;
    const elements = asArray(record.elements);
    const primaryElement = asRecord(elements[0]) ?? {};
    const location = getSlitherLocation(primaryElement);
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
    const severity = normalizeSeverity(record.impact);
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
      id: `slither-${fingerprint.slice(0, 16)}`,
      analyzer: "slither",
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
        raw: detector
      },
      evidenceItems: [
        {
          evidenceType: "ANALYZER",
          analyzer: "slither",
          toolName: "slither",
          filePath: location.filePath,
          startLine: location.lineStart,
          endLine: location.lineEnd,
          startColumn: location.columnStart,
          endColumn: location.columnEnd,
          ruleId,
          detectorName: ruleId,
          message: description,
          confidenceContribution: location.filePath && location.lineStart ? 0.8 : 0.48,
          rawArtifactPath: input.artifactKey,
          raw: detector
        }
      ],
      remediation: taxonomy.remediation,
      references: [],
      fingerprint,
      dedupeKey,
      raw: detector
    };
  }
}

function getSlitherLocation(element: Record<string, unknown>): SourceLocation {
  const sourceMapping = asRecord(element.source_mapping) ?? {};
  const lines = asArray(sourceMapping.lines)
    .map((line) => asNumber(line))
    .filter((line): line is number => typeof line === "number");
  const typeSpecificFields = asRecord(element.type_specific_fields) ?? {};
  const parent = asRecord(typeSpecificFields.parent) ?? {};

  return {
    filePath:
      asString(sourceMapping.filename_relative) ??
      asString(sourceMapping.filename_short) ??
      asString(sourceMapping.filename_absolute),
    contractName: asString(parent.name) ?? asString(typeSpecificFields.contract_name),
    functionName:
      asString(element.name) ??
      asString(typeSpecificFields.signature) ??
      asString(typeSpecificFields.function_name),
    lineStart: lines[0],
    lineEnd: lines.length > 0 ? lines[lines.length - 1] : undefined,
    columnStart: asNumber(sourceMapping.starting_column),
    columnEnd: asNumber(sourceMapping.ending_column)
  };
}
