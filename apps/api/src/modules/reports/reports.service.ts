import { createHash, createHmac, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ReportExportFormat } from "@prisma/client";
import { ApiError } from "../../common/errors/api-error.js";
import { ReportsRepository } from "./reports.repository.js";
import type { ListReportsQuery, ReportExportBody, ReportShareBody } from "./reports.schemas.js";
import { redactSecrets } from "../remediation/redaction.js";
import { UsageLimitService } from "../usage/usage-limits.service.js";
import { BillingEntitlementService, ENTITLEMENT_KEYS } from "../billing/entitlements.service.js";
import { env } from "../../config/environment.js";

export const PUBLIC_BETA_DISCLAIMER =
  "Web3Guard AI is a pre-audit readiness scanner. It is not a certified audit. Findings and remediation suggestions require human security review before production use.";

interface ReportActor {
  organizationId: string;
  actorUserId?: string | undefined;
}

export class ReportsService {
  constructor(
    private readonly repository = new ReportsRepository(),
    private readonly usageLimits = new UsageLimitService(),
    private readonly entitlements = new BillingEntitlementService()
  ) {}

  list(query: ListReportsQuery) {
    return this.repository.list(query);
  }

  async listByScan(scanId: string, organizationId: string) {
    return this.repository.listByScan(scanId, organizationId);
  }

  async get(id: string, organizationId?: string | undefined) {
    const report = await this.repository.findById(id);
    if (!report || (organizationId && report.organizationId !== organizationId)) {
      throw ApiError.notFound("Report");
    }

    return report;
  }

  async generate(scanId: string, actor: ReportActor) {
    const scan = await this.repository.scanForReport(scanId, actor.organizationId, false);
    if (!scan) {
      throw ApiError.notFound("Scan");
    }

    const document = buildReportDocument(scan, false);
    const inputChecksum = checksumJson(document);
    const reportNumber = `W3G-${new Date().toISOString().slice(0, 10).replace(/-/gu, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const artifactPrefix = path.posix.join("reports", sanitizePathSegment(scan.id), sanitizePathSegment(reportNumber));
    const markdown = renderMarkdown(document);
    const html = renderHtml(document);
    const jsonArtifact = await writeArtifact(artifactPrefix, "report.json", JSON.stringify(document, null, 2));
    const markdownArtifact = await writeArtifact(artifactPrefix, "report.md", markdown);
    const htmlArtifact = await writeArtifact(artifactPrefix, "report.html", html);
    const usageSummary = typeof (this.usageLimits as any).summary === "function"
      ? await this.usageLimits.summary(scan.organizationId).catch(() => null)
      : null;

    const report = await this.repository.createReport({
      organizationId: scan.organizationId,
      projectId: scan.projectId,
      scanId: scan.id,
      createdByUserId: actor.actorUserId,
      reportNumber,
      title: document.title,
      executiveSummary: document.executiveSummary,
      riskScore: document.riskScore,
      includeSuppressed: false,
      sections: document.sections.map((section) => ({
        key: section.key,
        title: section.title,
        body: section.body,
        checksum: checksum(section.body),
        metadata: section.metadata
      })),
      disclaimer: PUBLIC_BETA_DISCLAIMER,
      inputChecksum,
      jsonArtifactPath: jsonArtifact.artifactKey,
      markdownArtifactPath: markdownArtifact.artifactKey,
      htmlArtifactPath: htmlArtifact.artifactKey,
      checksumSha256: jsonArtifact.checksum,
      billingMetadata: usageSummary
        ? {
            plan: usageSummary.plan,
            periodStart: usageSummary.periodStart,
            periodEnd: usageSummary.periodEnd,
            counters: usageSummary.counters
          }
        : undefined
    });

    await this.repository.audit({
      organizationId: scan.organizationId,
      actorUserId: actor.actorUserId,
      action: "REPORT_GENERATE",
      resource: "REPORT",
      resourceId: report.id,
      metadata: { scanId: scan.id, reportNumber }
    });

    return report;
  }

  async export(reportId: string, actor: ReportActor, input: ReportExportBody) {
    const report = await this.get(reportId, actor.organizationId);
    await this.usageLimits.assertAndConsume(actor.organizationId, "REPORT_EXPORTS_PER_MONTH", {
      resourceType: "REPORT",
      resourceId: reportId
    });

    if (input.includeSuppressed && !report.includeSuppressed) {
      // P6 keeps public beta exports conservative. Authorized users can generate a new report with suppressed
      // findings later; the default export path never rehydrates hidden findings implicitly.
      throw ApiError.badRequest("This report was generated without suppressed findings");
    }

    if (input.format === "PDF") {
      const failed = await this.repository.createExport({
        reportId: report.id,
        organizationId: report.organizationId,
        projectId: report.projectId,
        scanId: report.scanId,
        requestedByUserId: actor.actorUserId,
        format: "PDF",
        status: "FAILED",
        errorCategory: "PDF_PROVIDER_NOT_CONFIGURED",
        error: "PDF renderer is not configured for P6 public beta exports"
      });
      await this.auditExport(report, actor, failed.id, "PDF");
      return failed;
    }

    const artifact = await this.renderExportArtifact(report, input.format);
    const exported = await this.repository.createExport({
      reportId: report.id,
      organizationId: report.organizationId,
      projectId: report.projectId,
      scanId: report.scanId,
      requestedByUserId: actor.actorUserId,
      format: input.format,
      status: "SUCCEEDED",
      artifactPath: artifact.artifactKey,
      checksumSha256: artifact.checksum
    });
    await this.auditExport(report, actor, exported.id, input.format);
    return exported;
  }

  async share(reportId: string, actor: ReportActor, input: ReportShareBody) {
    const report = await this.get(reportId, actor.organizationId);
    const security = await this.repository.securitySettings(report.organizationId);
    if (security?.publicReportSharingAllowed === false) {
      throw ApiError.accessDenied("Access denied");
    }
    await this.entitlements.assertEntitlement(report.organizationId, ENTITLEMENT_KEYS.publicReportSharing, 1, {
      resourceType: "REPORT_SHARE_LINK",
      resourceId: report.id,
      actorUserId: actor.actorUserId
    });
    if (input.includeSuppressed && !report.includeSuppressed) {
      throw ApiError.badRequest("This report was generated without suppressed findings");
    }
    const shareToken = randomBytes(32).toString("base64url");
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const share = await this.repository.createShareLink({
      reportId: report.id,
      organizationId: report.organizationId,
      projectId: report.projectId,
      scanId: report.scanId,
      createdByUserId: actor.actorUserId,
      shareTokenHash: shareTokenDigest(shareToken),
      tokenPrefix: shareToken.slice(0, 8),
      includeSuppressed: input.includeSuppressed,
      expiresAt
    });
    await this.repository.audit({
      organizationId: report.organizationId,
      actorUserId: actor.actorUserId,
      action: "REPORT_SHARE",
      resource: "REPORT_SHARE_LINK",
      resourceId: share.id,
      metadata: { reportId: report.id, expiresAt: expiresAt.toISOString(), includeSuppressed: input.includeSuppressed }
    });
    return { ...share, shareToken };
  }

  async revokeShare(reportId: string, actor: ReportActor) {
    const report = await this.get(reportId, actor.organizationId);
    const result = await this.repository.revokeShareLinks(report.id, actor.organizationId);
    await this.repository.audit({
      organizationId: report.organizationId,
      actorUserId: actor.actorUserId,
      action: "REPORT_REVOKE",
      resource: "REPORT",
      resourceId: report.id,
      metadata: { revokedCount: result.count }
    });
    return { ok: true, revokedCount: result.count };
  }

  async publicReport(shareToken: string) {
    const share = await this.repository.findPublicByShareTokenHash(shareTokenDigest(shareToken));
    if (!share || share.revokedAt || share.expiresAt.getTime() <= Date.now() || share.report.deletedAt) {
      throw ApiError.notFound("Public report");
    }
    await this.repository.touchShareLink(share.id);
    return sanitizePublicReport(share.report);
  }

  private async renderExportArtifact(
    report: Awaited<ReturnType<ReportsRepository["findById"]>> & {},
    format: Exclude<ReportExportFormat, "PDF">
  ) {
    const artifactPrefix = path.posix.join("reports", sanitizePathSegment(report.scanId), sanitizePathSegment(report.reportNumber), "exports");
    switch (format) {
      case "HTML":
        return writeArtifact(artifactPrefix, "report.html", renderHtml(reportToDocument(report)));
      case "JSON":
        return writeArtifact(artifactPrefix, "report.json", JSON.stringify(reportToDocument(report), null, 2));
      case "MARKDOWN":
        return writeArtifact(artifactPrefix, "report.md", renderMarkdown(reportToDocument(report)));
      case "SARIF":
        return writeArtifact(artifactPrefix, "report.sarif.json", JSON.stringify(reportToSarif(report), null, 2));
    }
  }

  private auditExport(report: { id: string; organizationId: string; scanId: string }, actor: ReportActor, exportId: string, format: string) {
    return this.repository.audit({
      organizationId: report.organizationId,
      actorUserId: actor.actorUserId,
      action: "REPORT_EXPORT",
      resource: "REPORT_EXPORT",
      resourceId: exportId,
      metadata: { reportId: report.id, scanId: report.scanId, format }
    });
  }
}

function buildReportDocument(scan: NonNullable<Awaited<ReturnType<ReportsRepository["scanForReport"]>>>, includeSuppressed: boolean) {
  const findings = scan.vulnerabilities.map((finding) => {
    const evidenceIds = finding.evidenceItems.map((evidence) => evidence.id);
    const firstEvidence = finding.evidenceItems[0];
    const firstCodeLink = finding.codeLinks[0];
    const aiValidation = finding.aiFindingValidations[0];
    const remediation = finding.remediationRuns[0];
    const simulation = finding.simulationRuns?.[0];
    const fuzzRun = finding.fuzzRuns?.[0];
    return {
      id: finding.id,
      title: redact(finding.title),
      message: redact(firstEvidence?.message ?? finding.description ?? finding.title),
      severity: finding.severity,
      confidenceState: finding.confidenceState,
      reviewStatus: finding.review?.status ?? "UNREVIEWED",
      evidenceIds,
      sourceRange: {
        filePath: firstEvidence?.filePath ?? finding.filePath,
        startLine: firstEvidence?.startLine ?? finding.lineStart,
        endLine: firstEvidence?.endLine ?? finding.lineEnd
      },
      analyzerSource: firstEvidence?.analyzerRun?.toolName ?? finding.analyzer,
      linkedContract: firstCodeLink?.contractSymbol?.fullyQualifiedName ?? firstCodeLink?.contractSymbol?.name ?? null,
      linkedFunction: firstCodeLink?.functionSymbol?.canonicalName ?? firstCodeLink?.functionSymbol?.name ?? null,
      aiValidationDecision: aiValidation?.decision ?? null,
      remediationStatus: remediation?.status ?? null,
      simulationStatus: simulation?.status ?? null,
      simulationDecision: simulation?.decision ?? null,
      simulationArtifactChecksums: simulation?.artifacts?.map((artifact) => artifact.checksumSha256) ?? [],
      fuzzStatus: fuzzRun?.status ?? null,
      invariantStatus: fuzzRun?.invariantStatus ?? null,
      fuzzArtifactChecksums: fuzzRun?.artifacts?.map((artifact) => artifact.checksumSha256) ?? [],
      counterexampleChecksums: fuzzRun?.counterexamples?.map((item) => item.checksumSha256).filter(Boolean) ?? [],
      coverageStatus: fuzzRun?.coverageSummaries?.[0]?.status ?? null,
      threatMatches: finding.threatSignatureMatches?.map((match) => ({
        id: match.id,
        signatureName: match.signature.name,
        kind: match.signature.kind,
        status: match.status,
        confidence: match.confidence,
        evidenceIdsUsed: match.evidenceIdsUsed,
        missingEvidence: match.missingEvidence
      })) ?? [],
      falsePositiveFeedbackCount: finding.falsePositiveFeedback?.length ?? 0,
      incidentReferences: finding.incidentReferences?.map((reference) => ({
        id: reference.id,
        title: redact(reference.title),
        confidence: reference.confidence
      })) ?? [],
      remediationSuggestion: redact(remediation?.suggestions[0]?.title ?? remediation?.suggestions[0]?.body ?? null),
      limitation: finding.evidenceItems.length === 0 || finding.confidenceState === "CANDIDATE" ? "Evidence is weak or incomplete and requires human review." : null
    };
  });

  const severityCounts = countBy(findings, "severity");
  const reviewCounts = countBy(findings, "reviewStatus");
  const notAssessedAreas = [
    ...(scan.analysisIrRuns.length === 0 ? ["Code intelligence was not assessed."] : []),
    ...(scan.buildRuns.length === 0 ? ["Build execution was not assessed."] : []),
    ...(scan.testRuns.length === 0 ? ["Test execution was not assessed."] : []),
    ...((scan.monitorRuns?.length ?? 0) === 0 ? ["Realtime monitoring was not assessed or not configured."] : []),
    ...((scan.threatSignatureMatches?.length ?? 0) === 0 ? ["Threat knowledge matching was not assessed or produced no persisted matches."] : [])
  ];
  const title = `${scan.title ?? "Web3Guard AI"} Professional Readiness Report`;
  const executiveSummary = [
    `Scan ${scan.id} contains ${findings.length} persisted evidence-backed finding(s).`,
    `Highest persisted risk score is ${Number(scan.riskScore).toFixed(0)}.`,
    "All findings and remediation suggestions require human security review before production use."
  ].join(" ");

  const sections = [
    section("executive-summary", "Executive Summary", executiveSummary),
    section("scope-target", "Scope and Target", [
      `Scan ID: ${scan.id}`,
      `Status: ${scan.status}`,
      `Targets: ${scan.targets.map((target) => target.targetType).join(", ") || "None persisted"}`,
      `Suppressed findings included: ${includeSuppressed ? "yes" : "no"}`
    ].join("\n")),
    section("build-test-coverage", "Build/Test Coverage", [
      `Build profiles: ${scan.buildProfiles.length}`,
      `Build runs: ${scan.buildRuns.map((run) => `${run.toolKind}:${run.status}`).join(", ") || "Not Assessed"}`,
      `Test runs: ${scan.testRuns.map((run) => `${run.toolKind}:${run.status}`).join(", ") || "Not Assessed"}`,
      `Compiler artifacts: ${scan.compilerArtifacts.length}`
    ].join("\n")),
    section("analyzer-coverage", "Analyzer Coverage", scan.analyzerRuns.map((run) => `${run.toolName}: ${run.status}`).join("\n") || "No analyzer runs persisted."),
    section("findings-by-severity", "Findings by Severity", Object.entries(severityCounts).map(([severity, count]) => `${severity}: ${count}`).join("\n") || "No findings."),
    section("finding-details", "Finding Details", findings.map(renderFindingDetail).join("\n\n") || "No persisted findings.", { findingCount: findings.length }),
    section("evidence-summary", "Evidence Summary", `Evidence IDs: ${findings.flatMap((finding) => finding.evidenceIds).join(", ") || "None persisted"}`),
    section("code-intelligence-summary", "Code Intelligence Summary", [
      `Contracts: ${scan.contractSymbols.length}`,
      `Functions: ${scan.functionSymbols.length}`,
      `External call sites: ${scan.externalCallSites.length}`,
      `Storage layout entries: ${scan.storageLayoutEntries.length}`
    ].join("\n")),
    section("ai-validation-summary", "AI Validation Summary", findings.map((finding) => `${finding.id}: ${finding.aiValidationDecision ?? "NOT_ASSESSED"}`).join("\n") || "No AI validation persisted."),
    section("remediation-summary", "Remediation Summary", findings.map((finding) => `${finding.id}: ${finding.remediationStatus ?? "NOT_ASSESSED"}`).join("\n") || "No remediation suggestions persisted."),
    section("simulation-summary", "Simulation Summary", [
      "Simulation runs only in a local fork/test environment and does not broadcast live transactions.",
      ...findings.map((finding) => `${finding.id}: ${finding.simulationStatus ?? "NOT_ASSESSED"} / ${finding.simulationDecision ?? "NOT_ASSESSED"}${finding.simulationArtifactChecksums.length > 0 ? ` checksums=${finding.simulationArtifactChecksums.join(",")}` : ""}`)
    ].join("\n")),
    section("fuzzing-summary", "Fuzzing Summary", [
      "Fuzzing runs only in a local/sandbox environment and does not broadcast live transactions.",
      `Scan-level fuzz runs: ${scan.fuzzRuns?.length ?? 0}`,
      ...findings.map((finding) => `${finding.id}: ${finding.fuzzStatus ?? "NOT_ASSESSED"} / invariant=${finding.invariantStatus ?? "NOT_ASSESSED"}${finding.fuzzArtifactChecksums.length > 0 ? ` checksums=${finding.fuzzArtifactChecksums.join(",")}` : ""}`)
    ].join("\n")),
    section("invariant-testing-summary", "Invariant Testing Summary", findings.map((finding) => `${finding.id}: ${finding.invariantStatus ?? "NOT_ASSESSED"}${finding.counterexampleChecksums.length > 0 ? ` counterexamples=${finding.counterexampleChecksums.join(",")}` : ""}`).join("\n") || "No invariant testing persisted."),
    section("coverage-summary", "Coverage Summary", findings.map((finding) => `${finding.id}: ${finding.coverageStatus ?? "NOT_ASSESSED"}`).join("\n") || "No real coverage data persisted."),
    section("monitoring-summary", "Monitoring Summary", renderMonitoringSummary(scan)),
    section("threat-knowledge-summary", "Threat Knowledge Summary", renderThreatKnowledgeSummary(scan)),
    section("not-assessed-areas", "Not Assessed Areas", notAssessedAreas.join("\n") || "No Not Assessed areas were detected from persisted records."),
    section("limitations", "Limitations", [
      PUBLIC_BETA_DISCLAIMER,
      "This report is generated from persisted scanner data only.",
      "Monitoring alerts are read-only observations backed by transaction or event evidence and do not imply an exploit unless evidence directly supports that conclusion.",
      "Threat signature matches are triage signals, not proof, and require human review.",
      "No exploit simulation, formal verification, or certified audit attestation is included."
    ].join("\n")),
    section("review-status-summary", "Review Status Summary", Object.entries(reviewCounts).map(([status, count]) => `${status}: ${count}`).join("\n") || "No review state persisted."),
    section("sarif-export-metadata", "SARIF/Export Metadata", `SARIF export is available from persisted finding evidence. Report generated at ${new Date().toISOString()}.`),
    section("disclaimer", "Disclaimer", PUBLIC_BETA_DISCLAIMER)
  ];

  return {
    schemaVersion: "p6-professional-report/v1",
    title,
    scanId: scan.id,
    organizationId: scan.organizationId,
    projectId: scan.projectId,
    generatedAt: new Date().toISOString(),
    riskScore: Number(scan.riskScore),
    executiveSummary,
    disclaimer: PUBLIC_BETA_DISCLAIMER,
    findings,
    sections
  };
}

function reportToDocument(report: NonNullable<Awaited<ReturnType<ReportsRepository["findById"]>>>) {
  return {
    schemaVersion: "p6-professional-report/v1",
    title: report.title,
    scanId: report.scanId,
    organizationId: report.organizationId,
    projectId: report.projectId,
    generatedAt: report.generatedAt?.toISOString() ?? report.createdAt.toISOString(),
    riskScore: Number(report.riskScore),
    executiveSummary: report.executiveSummary ?? "",
    disclaimer: report.disclaimers[0]?.text ?? PUBLIC_BETA_DISCLAIMER,
    findings: report.sections.find((section) => section.sectionKey === "findings-by-severity")?.metadata ?? [],
    sections: report.sections.map((section) => ({
      key: section.sectionKey,
      title: section.title,
      body: section.body,
      metadata: section.metadata
    }))
  };
}

function reportToSarif(report: NonNullable<Awaited<ReturnType<ReportsRepository["findById"]>>>) {
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: { driver: { name: "Web3Guard AI", informationUri: "https://web3guard.ai" } },
        automationDetails: { id: report.scanId },
        results: [],
        properties: {
          reportId: report.id,
          reportNumber: report.reportNumber,
          disclaimer: report.disclaimers[0]?.text ?? PUBLIC_BETA_DISCLAIMER
        }
      }
    ]
  };
}

function sanitizePublicReport(report: NonNullable<Awaited<ReturnType<ReportsRepository["findById"]>>>) {
  return {
    id: report.id,
    reportNumber: report.reportNumber,
    title: report.title,
    status: report.status,
    generatedAt: report.generatedAt,
    disclaimer: report.disclaimers[0]?.text ?? PUBLIC_BETA_DISCLAIMER,
    sections: report.sections,
    exports: report.exports.map((item) => ({
      id: item.id,
      format: item.format,
      status: item.status,
      checksumSha256: item.checksumSha256,
      createdAt: item.createdAt
    }))
  };
}

function section(key: string, title: string, body: string, metadata?: Record<string, unknown>) {
  return { key, title, body: redact(body), ...(metadata ? { metadata } : {}) };
}

function renderFindingDetail(finding: {
  id: string;
  title: string;
  message: string;
  severity: string;
  confidenceState: string;
  reviewStatus: string;
  evidenceIds: string[];
  sourceRange: { filePath: string | null; startLine: number | null; endLine: number | null };
  analyzerSource: string;
  linkedContract: string | null;
  linkedFunction: string | null;
  aiValidationDecision: string | null;
  remediationStatus: string | null;
  simulationStatus: string | null;
  simulationDecision: string | null;
  simulationArtifactChecksums: string[];
  fuzzStatus: string | null;
  invariantStatus: string | null;
  fuzzArtifactChecksums: string[];
  counterexampleChecksums: Array<string | null>;
  coverageStatus: string | null;
  threatMatches: Array<{
    id: string;
    signatureName: string;
    kind: string;
    status: string;
    confidence: string;
    evidenceIdsUsed: string[];
    missingEvidence: string[];
  }>;
  falsePositiveFeedbackCount: number;
  incidentReferences: Array<{ id: string; title: string; confidence: string }>;
  limitation: string | null;
}): string {
  return [
    `Finding ID: ${finding.id}`,
    `Title: ${finding.title}`,
    `Message: ${finding.message}`,
    `Severity: ${finding.severity}`,
    `Confidence state: ${finding.confidenceState}`,
    `Review status: ${finding.reviewStatus}`,
    `Evidence IDs: ${finding.evidenceIds.join(", ") || "None persisted"}`,
    `Source range: ${finding.sourceRange.filePath ?? "Not Assessed"}${finding.sourceRange.startLine ? `:${finding.sourceRange.startLine}` : ""}${finding.sourceRange.endLine && finding.sourceRange.endLine !== finding.sourceRange.startLine ? `-${finding.sourceRange.endLine}` : ""}`,
    `Analyzer source: ${finding.analyzerSource}`,
    `Linked contract: ${finding.linkedContract ?? "Not available"}`,
    `Linked function: ${finding.linkedFunction ?? "Not available"}`,
    `AI validation decision: ${finding.aiValidationDecision ?? "NOT_ASSESSED"}`,
    `Remediation suggestion status: ${finding.remediationStatus ?? "NOT_ASSESSED"}`,
    `Simulation status: ${finding.simulationStatus ?? "NOT_ASSESSED"}`,
    `Simulation decision: ${finding.simulationDecision ?? "NOT_ASSESSED"}`,
    `Simulation artifact checksums: ${finding.simulationArtifactChecksums.join(", ") || "None persisted"}`,
    `Fuzzing status: ${finding.fuzzStatus ?? "NOT_ASSESSED"}`,
    `Invariant status: ${finding.invariantStatus ?? "NOT_ASSESSED"}`,
    `Fuzz artifact checksums: ${finding.fuzzArtifactChecksums.join(", ") || "None persisted"}`,
    `Counterexample checksums: ${finding.counterexampleChecksums.filter(Boolean).join(", ") || "None persisted"}`,
    `Coverage status: ${finding.coverageStatus ?? "NOT_ASSESSED"}`,
    `Threat signature matches: ${finding.threatMatches.map((match) => `${match.signatureName}:${match.status}:${match.confidence}:evidence=${match.evidenceIdsUsed.join(",") || "None"}:missing=${match.missingEvidence.join(",") || "None"}`).join(" | ") || "None persisted"}`,
    `False-positive feedback count: ${finding.falsePositiveFeedbackCount}`,
    `Incident references: ${finding.incidentReferences.map((reference) => `${reference.title}:${reference.confidence}`).join(" | ") || "None persisted"}`,
    `Limitation: ${finding.limitation ?? "No weak-evidence limitation was recorded."}`
  ].join("\n");
}

function renderMonitoringSummary(scan: NonNullable<Awaited<ReturnType<ReportsRepository["scanForReport"]>>>): string {
  const monitorTargets = scan.monitorTargets ?? [];
  const monitorRuns = scan.monitorRuns ?? [];
  const monitorAlerts = scan.monitorAlerts ?? [];
  const targets = monitorTargets.map((target) =>
    [
      `Target ${target.id}`,
      `Address: ${target.normalizedAddress}`,
      `Kind: ${target.kind}`,
      `Status: ${target.status}`,
      `Rules: ${target.rules.map((rule) => rule.kind).join(", ") || "None persisted"}`,
      `Cursor: ${target.cursors[0]?.lastProcessedBlock?.toString() ?? "NOT_ASSESSED"}`
    ].join("\n")
  );
  const highAlerts = monitorAlerts.filter((alert) => ["HIGH", "CRITICAL"].includes(alert.severity)).slice(0, 10);
  const alertLines = monitorAlerts.map((alert) =>
    [
      `${alert.id}: ${alert.kind} ${alert.severity} ${alert.status}`,
      `target=${alert.targetAddress}`,
      `tx=${alert.transactionHash ?? "NOT_ASSESSED"}`,
      `block=${alert.blockNumber?.toString() ?? "NOT_ASSESSED"}`,
      `evidence=${alert.evidence.map((item) => item.id).join(",") || "None persisted"}`
    ].join(" ")
  );

  return [
    "Monitoring is read-only and does not sign transactions or execute mitigations.",
    `Monitor runs: ${monitorRuns.length}`,
    `Monitor targets: ${monitorTargets.length}`,
    `Alerts: ${monitorAlerts.length}`,
    `Recent high severity alerts: ${highAlerts.length}`,
    "",
    "Monitored targets:",
    targets.join("\n\n") || "No monitor targets persisted.",
    "",
    "Alert summary:",
    alertLines.join("\n") || "No monitoring alerts persisted.",
    "",
    monitorRuns.length === 0 ? "Limitation: monitoring is disabled, not configured, or has not run for this scan." : "Limitations: monitoring data reflects only configured targets, configured RPC coverage, and persisted on-chain evidence."
  ].join("\n");
}

function renderThreatKnowledgeSummary(scan: NonNullable<Awaited<ReturnType<ReportsRepository["scanForReport"]>>>): string {
  const matches = scan.threatSignatureMatches ?? [];
  const precision = scan.detectorPrecisionMetrics ?? [];
  const falsePositiveFeedback = scan.falsePositiveFeedback ?? [];
  const incidents = scan.incidentReferences ?? [];
  const threatIntel = scan.threatIntelEntries ?? [];
  const matchedLines = matches.slice(0, 20).map((match) =>
    [
      `${match.id}: ${match.signature.name} ${match.status} ${match.confidence}`,
      `kind=${match.signature.kind}`,
      `finding=${match.findingId ?? "NOT_APPLICABLE"}`,
      `alert=${match.alertId ?? "NOT_APPLICABLE"}`,
      `evidence=${match.evidenceIdsUsed.join(",") || "None persisted"}`,
      `missing=${match.missingEvidence.join(",") || "None"}`
    ].join(" ")
  );
  const precisionLines = precision.slice(0, 15).map((metric) =>
    `${metric.analyzer ?? "UNKNOWN"}:${metric.ruleId ?? "UNKNOWN"}:${metric.severity ?? "UNKNOWN"} precision=${Number(metric.precisionEstimate).toFixed(2)} tp=${metric.truePositiveCount} fp=${metric.falsePositiveCount} suppressed=${metric.suppressionCount}`
  );
  const incidentLines = incidents.slice(0, 10).map((incident) =>
    `${incident.id}: ${incident.title} ${incident.confidence} source=${incident.sourceType}`
  );

  return [
    "Threat knowledge is defensive triage context only. Signature matches do not auto-confirm findings or change severity, confidence, review, or remediation status.",
    `Threat intel entries: ${threatIntel.length}`,
    `Matched signatures: ${matches.length}`,
    `Detector precision metrics: ${precision.length}`,
    `False-positive feedback records: ${falsePositiveFeedback.length}`,
    `Incident references: ${incidents.length}`,
    "",
    "Matched signatures:",
    matchedLines.join("\n") || "No signature matches persisted.",
    "",
    "Detector precision summary:",
    precisionLines.join("\n") || "No detector precision metrics persisted.",
    "",
    "Relevant incident references:",
    incidentLines.join("\n") || "No incident references persisted.",
    "",
    "Limitations: signature match is not proof; human review is required; this report does not provide a certified audit claim."
  ].join("\n");
}

function renderMarkdown(document: ReturnType<typeof buildReportDocument> | ReturnType<typeof reportToDocument>): string {
  return [
    `# ${document.title}`,
    "",
    document.disclaimer,
    "",
    ...document.sections.flatMap((section) => [`## ${section.title}`, "", section.body, ""])
  ].join("\n");
}

function renderHtml(document: ReturnType<typeof buildReportDocument> | ReturnType<typeof reportToDocument>): string {
  const sections = document.sections
    .map((section) => `<section><h2>${escapeHtml(section.title)}</h2><pre>${escapeHtml(section.body)}</pre></section>`)
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(document.title)}</title></head><body><h1>${escapeHtml(document.title)}</h1><p><strong>${escapeHtml(document.disclaimer)}</strong></p>${sections}</body></html>`;
}

async function writeArtifact(prefix: string, filename: string, content: string) {
  const artifactKey = path.posix.join(prefix, filename);
  const root = path.resolve(env.LOCAL_ARTIFACT_DIR);
  const filePath = resolveWithin(root, artifactKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return { artifactKey, checksum: checksum(content) };
}

function resolveWithin(root: string, artifactKey: string): string {
  const target = path.resolve(root, artifactKey);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Report artifact path escapes artifact root");
  }
  return target;
}

function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const value = String(item[key]);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function checksumJson(value: unknown): string {
  return checksum(JSON.stringify(value));
}

function checksum(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function shareTokenDigest(value: string): string {
  return createHmac("sha256", env.REPORT_SHARE_SECRET).update(value).digest("hex");
}

function redact(value: string | null | undefined): string {
  return redactSecrets(value ?? "");
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 160);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}
