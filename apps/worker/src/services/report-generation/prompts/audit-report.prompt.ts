import type { AuditReportDocument } from "../report-types.js";

export const AUDIT_REPORT_PROMPT_VERSION = "audit-report-v1";

export function buildAuditReportSystemPrompt(): string {
  return [
    "You are a senior smart contract security auditor.",
    "You write concise, technically precise audit report language for enterprise customers.",
    "Use only the findings and evidence provided by the user.",
    "Do not invent source files, line numbers, vulnerabilities, exploitability, or references.",
    "If evidence is insufficient, explain the uncertainty rather than fabricating details.",
    "Return strict JSON only. Do not include markdown fences."
  ].join(" ");
}

export function buildAuditReportUserPrompt(report: AuditReportDocument, maxFindings: number): string {
  const findings = report.findings.slice(0, maxFindings).map((finding) => ({
    findingId: finding.id,
    title: finding.title,
    category: finding.category,
    severity: finding.severity,
    confidence: finding.confidence,
    riskScore: finding.riskScore,
    affectedLocations: finding.affectedLocations,
    evidenceSummary: finding.evidenceSummary,
    analyzerRemediation: finding.remediation,
    cweIds: finding.cweIds,
    swcIds: finding.swcIds,
    owaspSmartContractTop10: finding.owaspSmartContractTop10
  }));

  return JSON.stringify(
    {
      task:
        "Improve the professional audit language for the report summary and each provided finding.",
      constraints: {
        preserveFindingIds: true,
        doNotAddFindings: true,
        doNotInventCodeReferences: true,
        secureCodeExamplesMustBeGenericWhenNoExactPatchIsPossible: true
      },
      outputSchema: {
        executiveSummary: "string optional",
        severityNarrative: "string optional",
        recommendations: ["string optional"],
        findings: [
          {
            findingId: "string matching an input findingId",
            attackExplanation: "string optional",
            remediation: "string optional",
            secureCodeExample: "string optional",
            secureCodeNotes: "string optional"
          }
        ]
      },
      reportContext: {
        reportNumber: report.reportNumber,
        scanId: report.scanId,
        riskScore: report.riskScore,
        riskRating: report.riskRating,
        severityCounts: report.severityAnalysis.counts,
        existingExecutiveSummary: report.executiveSummary,
        existingSeverityNarrative: report.severityAnalysis.narrative
      },
      findings
    },
    null,
    2
  );
}
