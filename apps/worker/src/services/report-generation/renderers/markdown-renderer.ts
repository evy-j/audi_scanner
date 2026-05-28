import type { AuditReportDocument } from "../report-types.js";
import { AuditReportTemplate } from "../templates/audit-report.template.js";

export class MarkdownAuditReportRenderer {
  constructor(private readonly template = new AuditReportTemplate()) {}

  render(report: AuditReportDocument): string {
    const sections = this.template.renderSections(report);
    const frontMatter = [
      "---",
      `report_number: ${report.reportNumber}`,
      `scan_id: ${report.scanId}`,
      `organization_id: ${report.organizationId}`,
      `generated_at: ${report.generatedAt}`,
      `risk_rating: ${report.riskRating}`,
      `risk_score: ${report.riskScore.toFixed(2)}`,
      "---"
    ].join("\n");

    return [
      frontMatter,
      "",
      `# ${report.title}`,
      "",
      ...sections.flatMap((section) => [`## ${section.heading}`, "", section.body, ""]),
      "## AI Orchestration",
      "",
      `Provider: ${report.ai.provider}`,
      `AI Used: ${report.ai.used ? "yes" : "no"}`,
      `Prompt Version: ${report.ai.promptVersion}`,
      "",
      "_This report is generated from normalized scanner findings. Manual security review is recommended before production deployment._",
      ""
    ].join("\n");
  }
}
