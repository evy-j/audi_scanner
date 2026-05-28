import type {
  AggregatedVulnerability,
  AnalyzerName,
  NormalizedEvidence,
  NormalizedFindingEvidence,
  NormalizedFinding,
  SourceLocation
} from "./types.js";
import { createAggregateFingerprint } from "./fingerprint.js";
import { combineConfidence, maxSeverity } from "./severity.js";
import { scoreAggregate, scoreFinding } from "./risk-scoring.js";
import { uniqueObjectsBy, uniqueSorted } from "./utils.js";

export class VulnerabilityAggregator {
  aggregate(findings: NormalizedFinding[]): AggregatedVulnerability[] {
    const groups = new Map<string, NormalizedFinding[]>();

    for (const finding of findings) {
      const group = groups.get(finding.dedupeKey) ?? [];
      group.push(finding);
      groups.set(finding.dedupeKey, group);
    }

    return Array.from(groups.values())
      .map((group) => this.aggregateGroup(group))
      .sort((a, b) => b.riskScore - a.riskScore || a.title.localeCompare(b.title));
  }

  private aggregateGroup(findings: NormalizedFinding[]): AggregatedVulnerability {
    const sortedFindings = [...findings].sort((a, b) => scoreFinding(b) - scoreFinding(a));
    const primary = sortedFindings[0] ?? findings[0];

    if (!primary) {
      throw new Error("Cannot aggregate an empty vulnerability group");
    }

    const analyzers = uniqueSorted(findings.map((finding) => finding.analyzer)) as AnalyzerName[];
    const severity = maxSeverity(findings.map((finding) => finding.severity));
    const confidence = combineConfidence(
      findings.map((finding) => finding.confidence),
      analyzers.length
    );
    const findingScores = findings.map((finding) => scoreFinding(finding));
    const riskScore = scoreAggregate({
      severity,
      confidence,
      category: primary.category,
      analyzerCount: analyzers.length,
      findingScores
    });
    const fingerprint = createAggregateFingerprint(findings);
    const remediation = sortedFindings.find((finding) => finding.remediation)?.remediation;

    return {
      id: `vuln-${fingerprint.slice(0, 16)}`,
      fingerprint,
      title: primary.title,
      description: primary.description,
      category: primary.category,
      severity,
      confidence,
      riskScore,
      cweIds: uniqueSorted(findings.flatMap((finding) => finding.cweIds)),
      swcIds: uniqueSorted(findings.flatMap((finding) => finding.swcIds)),
      owaspSmartContractTop10: uniqueSorted(
        findings.flatMap((finding) => finding.owaspSmartContractTop10)
      ) as AggregatedVulnerability["owaspSmartContractTop10"],
      owaspWebTop10: uniqueSorted(findings.flatMap((finding) => finding.owaspWebTop10)),
      references: uniqueSorted(findings.flatMap((finding) => finding.references)),
      primaryLocation: primary.location,
      locations: uniqueLocations(findings.map((finding) => finding.location)),
      analyzerCount: analyzers.length,
      analyzers,
      findingIds: uniqueSorted(findings.map((finding) => finding.id)),
      evidence: uniqueEvidence(findings.map((finding) => finding.evidence)),
      evidenceItems: uniqueFindingEvidence(findings.flatMap((finding) => finding.evidenceItems)),
      ...(remediation ? { remediation } : {})
    };
  }
}

function uniqueLocations(locations: SourceLocation[]): SourceLocation[] {
  return uniqueObjectsBy(locations, (location) =>
    [
      location.filePath ?? "",
      location.contractName ?? "",
      location.functionName ?? "",
      location.lineStart ?? "",
      location.lineEnd ?? ""
    ].join("|")
  );
}

function uniqueEvidence(evidence: NormalizedEvidence[]): NormalizedEvidence[] {
  return uniqueObjectsBy(evidence, (item) =>
    [item.summary, item.code ?? "", JSON.stringify(item.trace ?? null)].join("|")
  );
}

function uniqueFindingEvidence(evidence: NormalizedFindingEvidence[]): NormalizedFindingEvidence[] {
  return uniqueObjectsBy(evidence, (item) =>
    [
      item.evidenceType,
      item.rawArtifactPath,
      item.ruleId ?? "",
      item.filePath ?? "",
      item.startLine ?? "",
      item.endLine ?? "",
      item.message
    ].join("|")
  );
}
