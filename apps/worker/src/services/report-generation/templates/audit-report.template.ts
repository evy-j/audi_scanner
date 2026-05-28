import type { AuditReportDocument, AuditReportFinding } from "../report-types.js";

export interface RenderedReportSection {
  heading: string;
  body: string;
}

export class AuditReportTemplate {
  renderSections(report: AuditReportDocument): RenderedReportSection[] {
    return [
      {
        heading: "Executive Summary",
        body: report.executiveSummary
      },
      {
        heading: "Scope",
        body: [
          `Report Number: ${report.reportNumber}`,
          `Scan ID: ${report.scanId}`,
          `Generated At: ${report.generatedAt}`,
          `Total Analyzer Findings: ${report.scope.totalAnalyzerFindings}`,
          `Unique Vulnerabilities: ${report.scope.uniqueVulnerabilities}`
        ].join("\n")
      },
      {
        heading: "Risk Score",
        body: `Overall Risk: ${report.riskRating}\nScore: ${report.riskScore.toFixed(2)}/100`
      },
      {
        heading: "Severity Analysis",
        body: [
          report.severityAnalysis.narrative,
          "",
          "| Severity | Count |",
          "| --- | ---: |",
          `| Critical | ${report.severityAnalysis.counts.critical} |`,
          `| High | ${report.severityAnalysis.counts.high} |`,
          `| Medium | ${report.severityAnalysis.counts.medium} |`,
          `| Low | ${report.severityAnalysis.counts.low} |`,
          `| Informational | ${report.severityAnalysis.counts.informational} |`
        ].join("\n")
      },
      {
        heading: "Findings",
        body:
          report.findings.length === 0
            ? "No vulnerabilities were present in the normalized analyzer output."
            : report.findings.map((finding, index) => renderFinding(finding, index + 1)).join("\n\n")
      },
      {
        heading: "Recommendations",
        body: report.recommendations.map((recommendation) => `- ${recommendation}`).join("\n")
      },
      {
        heading: "Methodology",
        body: report.methodology.map((step) => `- ${step}`).join("\n")
      }
    ];
  }
}

function renderFinding(finding: AuditReportFinding, index: number): string {
  const locations =
    finding.affectedLocations.length > 0
      ? finding.affectedLocations.map((location) => `- ${location}`).join("\n")
      : "- No source location was provided by analyzers.";
  const references =
    finding.references.length > 0
      ? finding.references.map((reference) => `- ${reference}`).join("\n")
      : "- No external references were supplied by analyzers.";

  return [
    `### ${index}. ${finding.title}`,
    "",
    `Finding ID: ${finding.id}`,
    `Severity: ${finding.severity}`,
    `Confidence: ${finding.confidence}`,
    `Risk Score: ${finding.riskScore.toFixed(2)}/100`,
    `Category: ${finding.category}`,
    `Analyzers: ${finding.analyzers.join(", ")}`,
    "",
    "Affected Locations:",
    locations,
    "",
    "Attack Explanation:",
    finding.attackExplanation,
    "",
    "Evidence:",
    finding.evidenceSummary,
    "",
    "Remediation:",
    finding.remediation,
    "",
    "Secure Code Example:",
    `\`\`\`${finding.secureCodeExample.language === "solidity" ? "solidity" : ""}`,
    finding.secureCodeExample.code,
    "```",
    finding.secureCodeExample.notes,
    "",
    "References:",
    references
  ].join("\n");
}
