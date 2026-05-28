"use client";

import * as React from "react";
import { BrainCircuit, Download, FileText, FlaskConical, Network, PlayCircle, ShieldAlert, ShieldCheck, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditScannerApiClient, hasWorkspaceConfig } from "@/lib/api-client";
import { safeErrorMessage, safeFuzzStatusMessage, safeSimulationStatusMessage } from "@/lib/error-messages";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";
import { formatDateTime, toNumber } from "@/lib/utils";
import type {
  AuditReport,
  AnalysisIrSummary,
  AiFindingValidationResponse,
  AiScanValidationSummary,
  AnalyzerToolAvailability,
  BaselineComparison,
  BuildProfile,
  BuildRun,
  CallGraphEdge,
  CompilerArtifact,
  ContractSymbol,
  EvidenceSummary,
  ExternalCallSite,
  FindingCodeLink,
  FindingFuzzResponse,
  FindingRemediationResponse,
  FindingSimulationResponse,
  FindingReviewStatus,
  ReviewSummary,
  Scan,
  Severity,
  StorageLayoutEntry,
  TestRun,
  Vulnerability
} from "@/types/api";

export function ReportViewer({ reportId }: { reportId: string }) {
  const { config } = useWorkspaceConfig();
  const [report, setReport] = React.useState<AuditReport | null>(null);
  const [reports, setReports] = React.useState<AuditReport[]>([]);
  const [vulnerabilities, setVulnerabilities] = React.useState<Vulnerability[]>([]);
  const [scan, setScan] = React.useState<Scan | null>(null);
  const [evidenceSummary, setEvidenceSummary] = React.useState<EvidenceSummary | null>(null);
  const [reviewSummary, setReviewSummary] = React.useState<ReviewSummary | null>(null);
  const [baselineComparison, setBaselineComparison] = React.useState<BaselineComparison | null>(null);
  const [irSummary, setIrSummary] = React.useState<AnalysisIrSummary | null>(null);
  const [buildProfile, setBuildProfile] = React.useState<BuildProfile | null>(null);
  const [buildRuns, setBuildRuns] = React.useState<BuildRun[]>([]);
  const [compilerArtifacts, setCompilerArtifacts] = React.useState<CompilerArtifact[]>([]);
  const [testRuns, setTestRuns] = React.useState<TestRun[]>([]);
  const [toolAvailability, setToolAvailability] = React.useState<AnalyzerToolAvailability[]>([]);
  const [aiValidationSummary, setAiValidationSummary] = React.useState<AiScanValidationSummary | null>(null);
  const [contracts, setContracts] = React.useState<ContractSymbol[]>([]);
  const [callGraph, setCallGraph] = React.useState<CallGraphEdge[]>([]);
  const [externalCalls, setExternalCalls] = React.useState<ExternalCallSite[]>([]);
  const [storageLayout, setStorageLayout] = React.useState<StorageLayoutEntry[]>([]);
  const [selectedFinding, setSelectedFinding] = React.useState<Vulnerability | null>(null);
  const [selectedCodeLinks, setSelectedCodeLinks] = React.useState<FindingCodeLink[]>([]);
  const [selectedAiValidation, setSelectedAiValidation] = React.useState<AiFindingValidationResponse | null>(null);
  const [selectedRemediation, setSelectedRemediation] = React.useState<FindingRemediationResponse | null>(null);
  const [selectedSimulation, setSelectedSimulation] = React.useState<FindingSimulationResponse | null>(null);
  const [selectedFuzz, setSelectedFuzz] = React.useState<FindingFuzzResponse | null>(null);
  const [reviewStatusFilter, setReviewStatusFilter] = React.useState<"ALL" | FindingReviewStatus>("ALL");
  const [severityFilter, setSeverityFilter] = React.useState<"ALL" | Severity>("ALL");
  const [confidenceFilter, setConfidenceFilter] = React.useState("ALL");
  const [analyzerFilter, setAnalyzerFilter] = React.useState("ALL");
  const [reviewActionError, setReviewActionError] = React.useState<string | null>(null);
  const [shareLink, setShareLink] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!hasWorkspaceConfig(config)) {
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const client = new AuditScannerApiClient(config);
        let selectedReport: AuditReport | null = null;
        if (reportId === "latest") {
          const list = await client.listReports(10);
          setReports(list);
          selectedReport = list[0] ?? null;
        } else {
          selectedReport = await client.getReport(reportId);
        }
        setReport(selectedReport);
        if (selectedReport) {
          const [scanRecord, findings, summary] = await Promise.all([
            client.getScan(selectedReport.scanId),
            client.listScanFindings(selectedReport.scanId, 100),
            client.getEvidenceSummary(selectedReport.scanId)
          ]);
          const [
            reviewSummaryResult,
            baselineResult,
            irSummaryResult,
            buildProfileResult,
            buildRunsResult,
            compilerArtifactsResult,
            testRunsResult,
            toolAvailabilityResult,
            aiValidationSummaryResult,
            contractsResult,
            callGraphResult,
            externalCallsResult,
            storageLayoutResult
          ] = await Promise.allSettled([
            client.getReviewSummary(selectedReport.scanId),
            client.getBaselineComparison(selectedReport.scanId),
            client.getIrSummary(selectedReport.scanId),
            client.getBuildProfile(selectedReport.scanId),
            client.listBuildRuns(selectedReport.scanId),
            client.listCompilerArtifacts(selectedReport.scanId),
            client.listTestRuns(selectedReport.scanId),
            client.listToolAvailability(selectedReport.scanId),
            client.getAiValidationSummary(selectedReport.scanId),
            client.listContracts(selectedReport.scanId),
            client.getCallGraph(selectedReport.scanId),
            client.listExternalCalls(selectedReport.scanId),
            client.listStorageLayout(selectedReport.scanId)
          ]);
          const selected = findings[0] ?? null;
          setScan(scanRecord);
          setVulnerabilities(findings);
          setEvidenceSummary(summary);
          setReviewSummary(reviewSummaryResult.status === "fulfilled" ? reviewSummaryResult.value : null);
          setBaselineComparison(baselineResult.status === "fulfilled" ? baselineResult.value : null);
          setIrSummary(irSummaryResult.status === "fulfilled" ? irSummaryResult.value : null);
          setBuildProfile(buildProfileResult.status === "fulfilled" ? buildProfileResult.value : null);
          setBuildRuns(buildRunsResult.status === "fulfilled" ? buildRunsResult.value : []);
          setCompilerArtifacts(compilerArtifactsResult.status === "fulfilled" ? compilerArtifactsResult.value : []);
          setTestRuns(testRunsResult.status === "fulfilled" ? testRunsResult.value : []);
          setToolAvailability(toolAvailabilityResult.status === "fulfilled" ? toolAvailabilityResult.value : []);
          setAiValidationSummary(aiValidationSummaryResult.status === "fulfilled" ? aiValidationSummaryResult.value : null);
          setContracts(contractsResult.status === "fulfilled" ? contractsResult.value : []);
          setCallGraph(callGraphResult.status === "fulfilled" ? callGraphResult.value : []);
          setExternalCalls(externalCallsResult.status === "fulfilled" ? externalCallsResult.value : []);
          setStorageLayout(storageLayoutResult.status === "fulfilled" ? storageLayoutResult.value : []);
          setSelectedFinding(selected);
          setSelectedCodeLinks(selected ? await client.getFindingCodeLinks(selected.id).catch(() => []) : []);
          setSelectedAiValidation(selected ? await client.getFindingAiValidation(selected.id).catch(() => null) : null);
          setSelectedRemediation(selected ? await client.getFindingRemediation(selected.id).catch(() => null) : null);
          setSelectedSimulation(selected ? await client.getFindingSimulations(selected.id).catch(() => null) : null);
          setSelectedFuzz(selected ? await client.getFindingFuzz(selected.id).catch(() => null) : null);
        } else {
          setScan(null);
          setVulnerabilities([]);
          setEvidenceSummary(null);
          setReviewSummary(null);
          setBaselineComparison(null);
          setIrSummary(null);
          setBuildProfile(null);
          setBuildRuns([]);
          setCompilerArtifacts([]);
          setTestRuns([]);
          setToolAvailability([]);
          setAiValidationSummary(null);
          setContracts([]);
          setCallGraph([]);
          setExternalCalls([]);
          setStorageLayout([]);
          setSelectedFinding(null);
          setSelectedCodeLinks([]);
          setSelectedAiValidation(null);
          setSelectedRemediation(null);
          setSelectedSimulation(null);
          setSelectedFuzz(null);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to load report");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [config, reportId]);

  const filteredVulnerabilities = vulnerabilities.filter((finding) => {
    const reviewStatus = finding.review?.status ?? "UNREVIEWED";
    return (
      (reviewStatusFilter === "ALL" || reviewStatus === reviewStatusFilter) &&
      (severityFilter === "ALL" || finding.severity === severityFilter) &&
      (confidenceFilter === "ALL" || finding.confidence === confidenceFilter) &&
      (analyzerFilter === "ALL" || finding.analyzer === analyzerFilter)
    );
  });

  const refreshFinding = React.useCallback(
    async (findingId: string) => {
      if (!hasWorkspaceConfig(config)) return;
      const client = new AuditScannerApiClient(config);
      const updated = await client.getFinding(findingId);
      const codeLinks = await client.getFindingCodeLinks(findingId).catch(() => []);
      const aiValidation = await client.getFindingAiValidation(findingId).catch(() => null);
      const remediation = await client.getFindingRemediation(findingId).catch(() => null);
      const simulation = await client.getFindingSimulations(findingId).catch(() => null);
      const fuzz = await client.getFindingFuzz(findingId).catch(() => null);
      setVulnerabilities((items) => items.map((item) => (item.id === findingId ? updated : item)));
      setSelectedFinding(updated);
      setSelectedCodeLinks(codeLinks);
      setSelectedAiValidation(aiValidation);
      setSelectedRemediation(remediation);
      setSelectedSimulation(simulation);
      setSelectedFuzz(fuzz);
      if (updated.scanId) {
        const [summaryResult, baselineResult] = await Promise.allSettled([
          client.getReviewSummary(updated.scanId),
          client.getBaselineComparison(updated.scanId)
        ]);
        if (summaryResult.status === "fulfilled") setReviewSummary(summaryResult.value);
        if (baselineResult.status === "fulfilled") setBaselineComparison(baselineResult.value);
      }
    },
    [config]
  );

  const exportSarif = async () => {
    if (!hasWorkspaceConfig(config) || !scan) return;
    setReviewActionError(null);
    try {
      const sarif = await new AuditScannerApiClient(config).exportSarif(scan.id, true);
      const blob = new Blob([JSON.stringify(sarif, null, 2)], { type: "application/sarif+json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${scan.id}.sarif`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setReviewActionError(cause instanceof Error ? cause.message : "Unable to export SARIF");
    }
  };

  const generateReportExport = async (format: "HTML" | "PDF" | "JSON" | "SARIF" | "MARKDOWN") => {
    if (!hasWorkspaceConfig(config) || !report) return;
    setReviewActionError(null);
    try {
      const exported = await new AuditScannerApiClient(config).exportReport(report.id, format);
      setReport(await new AuditScannerApiClient(config).getReport(report.id));
      if (exported.status === "FAILED") {
        setReviewActionError(
          safeErrorMessage({
            code: exported.errorCategory ?? undefined,
            message: exported.error ?? `${format} export failed`
          })
        );
      }
    } catch (cause) {
      setReviewActionError(cause instanceof Error ? cause.message : `Unable to export ${format}`);
    }
  };

  const createShareLink = async () => {
    if (!hasWorkspaceConfig(config) || !report) return;
    setReviewActionError(null);
    try {
      const share = await new AuditScannerApiClient(config).shareReport(report.id);
      setShareLink(`${config.apiBaseUrl}/public/reports/${share.shareToken}`);
      setReport(await new AuditScannerApiClient(config).getReport(report.id));
    } catch (cause) {
      setReviewActionError(cause instanceof Error ? cause.message : "Unable to create share link");
    }
  };

  const revokeShareLink = async () => {
    if (!hasWorkspaceConfig(config) || !report) return;
    setReviewActionError(null);
    try {
      await new AuditScannerApiClient(config).revokeReportShare(report.id);
      setShareLink(null);
      setReport(await new AuditScannerApiClient(config).getReport(report.id));
    } catch (cause) {
      setReviewActionError(cause instanceof Error ? cause.message : "Unable to revoke share link");
    }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Badge variant="blue" className="mb-3">Audit reports</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Report intelligence</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Executive findings, risk scoring, remediation guidance, and PDF export metadata.
          </p>
        </div>
        <Button variant="secondary" disabled={!report?.pdfStorageKey}>
          <Download className="h-4 w-4" />
          PDF artifact
        </Button>
        <Button variant="secondary" disabled={!scan} onClick={exportSarif}>
          <Download className="h-4 w-4" />
          SARIF
        </Button>
      </div>

      {error ? <div className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      {reviewActionError ? <div className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{reviewActionError}</div> : null}
      <div className="mb-4 rounded-md border border-amber-300/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-50">
        Web3Guard AI is a pre-audit readiness scanner. It is not a certified audit. Findings and remediation suggestions require human security review before production use.
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[320px]" />
        </div>
      ) : report ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>{report.title}</CardTitle>
                  <p className="mt-2 text-sm text-muted-foreground">{report.reportNumber ?? report.id}</p>
                </div>
                <Badge variant={toNumber(report.riskScore) >= 70 ? "red" : "default"}>{report.status}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-6 grid gap-3 sm:grid-cols-3">
                <Stat label="Risk score" value={toNumber(report.riskScore).toFixed(0)} />
                <Stat label="Version" value={`v${report.version}`} />
                <Stat label="Generated" value={formatDateTime(report.generatedAt)} />
              </div>
              <section className="rounded-lg border border-white/10 bg-white/6 p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Executive summary
                </div>
                <p className="text-sm leading-7 text-slate-300">
                  {report.executiveSummary ?? "The report record does not include an executive summary."}
                </p>
              </section>
              <section className="mt-4 rounded-lg border border-white/10 bg-white/6 p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <ShieldCheck className="h-4 w-4 text-amber-200" />
                  Evidence-backed findings
                </div>
                <FindingFilters
                  reviewStatusFilter={reviewStatusFilter}
                  setReviewStatusFilter={setReviewStatusFilter}
                  severityFilter={severityFilter}
                  setSeverityFilter={setSeverityFilter}
                  confidenceFilter={confidenceFilter}
                  setConfidenceFilter={setConfidenceFilter}
                  analyzerFilter={analyzerFilter}
                  setAnalyzerFilter={setAnalyzerFilter}
                  vulnerabilities={vulnerabilities}
                />
                {filteredVulnerabilities.length > 0 ? (
                  <div className="space-y-5">
                    {severityOrder.map((severity) => {
                      const items = filteredVulnerabilities.filter((finding) => finding.severity === severity);
                      if (items.length === 0) return null;
                      return (
                        <div key={severity}>
                          <div className="mb-2 flex items-center gap-2">
                            <Badge variant={severity === "CRITICAL" || severity === "HIGH" ? "red" : "default"}>
                              {severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{items.length} persisted</span>
                          </div>
                          <div className="space-y-3">
                            {items.map((finding) => (
                              <FindingCard
                                key={finding.id}
                                finding={finding}
                                selected={selectedFinding?.id === finding.id}
                                onSelect={() => {
                                  setSelectedFinding(finding);
                                  void refreshFinding(finding.id);
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No persisted findings match the selected filters.</div>
                )}
              </section>
              {baselineComparison ? (
                <section className="mt-4 rounded-lg border border-white/10 bg-white/6 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <ShieldAlert className="h-4 w-4 text-sky-200" />
                    Baseline comparison
                  </div>
                  <div className="grid gap-2 sm:grid-cols-5">
                    <MiniStat label="New" value={String(baselineComparison.newFindings.length)} />
                    <MiniStat label="Existing" value={String(baselineComparison.existingFindings.length)} />
                    <MiniStat label="Fixed" value={String(baselineComparison.fixedFindings.length)} />
                    <MiniStat label="Regressed" value={String(baselineComparison.regressedFindings.length)} />
                    <MiniStat label="Suppressed" value={String(baselineComparison.suppressedFindings.length)} />
                  </div>
                </section>
              ) : null}
              <CodeIntelligenceSection
                irSummary={irSummary}
                compilerArtifacts={compilerArtifacts}
                contracts={contracts}
                callGraph={callGraph}
                externalCalls={externalCalls}
                storageLayout={storageLayout}
              />
              <BuildIntelligenceSection
                buildProfile={buildProfile}
                buildRuns={buildRuns}
                compilerArtifacts={compilerArtifacts}
                testRuns={testRuns}
                toolAvailability={toolAvailability}
              />
              <AiValidationSection summary={aiValidationSummary} />
              <section className="mt-4 rounded-lg border border-white/10 bg-white/6 p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <FileText className="h-4 w-4 text-sky-200" />
                  Export center
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {(["HTML", "PDF", "JSON", "SARIF", "MARKDOWN"] as const).map((format) => (
                    <Button key={format} variant="secondary" onClick={() => void generateReportExport(format)}>
                      {format}
                    </Button>
                  ))}
                  <Button variant="secondary" onClick={() => void createShareLink()}>Copy report link</Button>
                  <Button variant="secondary" onClick={() => void revokeShareLink()}>Revoke public link</Button>
                </div>
                {shareLink ? (
                  <div className="mb-3 rounded border border-white/10 bg-black/20 p-2 text-xs text-slate-200">{shareLink}</div>
                ) : null}
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>HTML: {report.htmlArtifactPath ?? "Not available"}</div>
                  <div>Markdown: {report.markdownArtifactPath ?? report.storageKey ?? "Not available"}</div>
                  <div>JSON: {report.jsonArtifactPath ?? "Not available"}</div>
                  <div>PDF: {report.pdfStorageKey ?? "Not Assessed"}</div>
                  <div>Checksum: {report.checksumSha256 ?? "Not available"}</div>
                  <div>Generated: {formatDateTime(report.generatedAt)}</div>
                  {report.exports?.slice(0, 5).map((item) => (
                    <div key={item.id}>
                      {item.format}: {item.status} · {item.artifactPath ?? item.errorCategory ?? "No artifact"} · {item.checksumSha256 ?? "No checksum"}
                    </div>
                  ))}
                </div>
              </section>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Analyzer status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {scan?.analyzerRuns?.length ? (
                scan.analyzerRuns.map((run) => (
                  <div key={run.id} className="rounded-md border border-white/10 bg-white/6 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-white">{run.toolName}</div>
                      <Badge variant={run.status === "COMPLETED" ? "default" : "red"}>
                        {run.status === "COMPLETED" ? "Assessed" : "Not Assessed"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Raw status: {run.status}</div>
                    {run.error ? <div className="mt-2 text-xs leading-5 text-red-100">{run.error}</div> : null}
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-white/10 bg-white/6 p-3 text-sm text-muted-foreground">
                  Analyzer runs are not available for this scan.
                </div>
              )}
              {evidenceSummary ? (
                <div className="rounded-md border border-white/10 bg-white/6 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
                    <ShieldAlert className="h-4 w-4 text-amber-200" />
                    Evidence summary
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>Findings: {evidenceSummary.findingCount}</div>
                    <div>Evidence items: {evidenceSummary.evidenceCount}</div>
                    <div>Max exploitability: {evidenceSummary.maxExploitabilityScore.toFixed(0)}</div>
                    <div>Average evidence quality: {evidenceSummary.averageEvidenceQuality.toFixed(0)}</div>
                  </div>
                </div>
              ) : null}
              {reviewSummary ? (
                <div className="rounded-md border border-white/10 bg-white/6 p-3">
                  <div className="mb-2 text-sm font-medium text-white">Review summary</div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div>Reviewed: {reviewSummary.findingCount - (reviewSummary.statusCounts.UNREVIEWED ?? 0)}</div>
                    <div>Needs review: {reviewSummary.statusCounts.NEEDS_REVIEW ?? 0}</div>
                    <div>Suppressed: {reviewSummary.suppressedCount}</div>
                  </div>
                </div>
              ) : null}
              {selectedFinding ? (
                <FindingCodeLinksPanel finding={selectedFinding} codeLinks={selectedCodeLinks} />
              ) : null}
              {selectedFinding ? (
                <FindingAiValidationPanel validation={selectedAiValidation} />
              ) : null}
              {selectedFinding ? (
                <FindingSimulationPanel
                  finding={selectedFinding}
                  simulation={selectedSimulation}
                  configReady={hasWorkspaceConfig(config)}
                  onError={setReviewActionError}
                  onRefresh={refreshFinding}
                  clientFactory={() => new AuditScannerApiClient(config)}
                />
              ) : null}
              {selectedFinding ? (
                <FindingFuzzPanel
                  finding={selectedFinding}
                  fuzz={selectedFuzz}
                  configReady={hasWorkspaceConfig(config)}
                  onError={setReviewActionError}
                  onRefresh={refreshFinding}
                  clientFactory={() => new AuditScannerApiClient(config)}
                />
              ) : null}
              {selectedFinding ? (
                <FindingRemediationPanel
                  finding={selectedFinding}
                  remediation={selectedRemediation}
                  configReady={hasWorkspaceConfig(config)}
                  onError={setReviewActionError}
                  onRefresh={refreshFinding}
                  clientFactory={() => new AuditScannerApiClient(config)}
                />
              ) : null}
              {selectedFinding ? (
                <ReviewPanel
                  finding={selectedFinding}
                  configReady={hasWorkspaceConfig(config)}
                  onError={setReviewActionError}
                  onRefresh={refreshFinding}
                  clientFactory={() => new AuditScannerApiClient(config)}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent reports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(reports.length > 0 ? reports : [report]).map((item) => (
                <div key={item.id} className="rounded-md border border-white/10 bg-white/6 p-3">
                  <div className="text-sm font-medium text-white">{item.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">No report available</CardContent>
        </Card>
      )}
    </AppShell>
  );
}

const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"] as const;

function CodeIntelligenceSection({
  irSummary,
  compilerArtifacts,
  contracts,
  callGraph,
  externalCalls,
  storageLayout
}: {
  irSummary: AnalysisIrSummary | null;
  compilerArtifacts: CompilerArtifact[];
  contracts: ContractSymbol[];
  callGraph: CallGraphEdge[];
  externalCalls: ExternalCallSite[];
  storageLayout: StorageLayoutEntry[];
}) {
  const notAssessed = !irSummary || irSummary.extractionStatus === "NOT_ASSESSED";

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-white/6 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <Network className="h-4 w-4 text-emerald-200" />
        Code intelligence
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <MiniStat label="IR status" value={irSummary?.extractionStatus ?? "NOT_ASSESSED"} />
        <MiniStat label="Contracts" value={String(irSummary?.contractCount ?? 0)} />
        <MiniStat label="Functions" value={String(irSummary?.functionCount ?? 0)} />
        <MiniStat label="External calls" value={String(irSummary?.externalCallCount ?? 0)} />
      </div>
      {notAssessed ? (
        <div className="rounded border border-amber-300/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
          AST/source-map extraction is Not Assessed for this scan because no real solc standard JSON artifact
          was persisted with the prepared source artifacts or compiler artifact capture.
          {compilerArtifacts.length > 0 ? ` Captured compiler artifacts: ${compilerArtifacts.length}.` : ""}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-medium text-white">Contracts and functions</div>
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {contracts.length > 0 ? (
                contracts.map((contract) => (
                  <div key={contract.id} className="rounded border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 text-xs font-medium text-white">{contract.name}</div>
                      <Badge variant="blue">{contract.extractionStatus}</Badge>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {formatLocation(contract.filePath, contract.startLine, contract.endLine)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span>Functions: {contract._count?.functions ?? 0}</span>
                      <span>State: {contract._count?.stateVariables ?? 0}</span>
                      <span>Events: {contract._count?.events ?? 0}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">No contract symbols were persisted.</div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-white">Basic call graph</div>
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {callGraph.length > 0 ? (
                callGraph.slice(0, 30).map((edge) => (
                  <div key={edge.id} className="rounded border border-white/10 bg-black/20 p-3 text-xs">
                    <div className="text-white">
                      {edge.fromContract}.{edge.fromFunction} {"->"} {edge.toContract ? `${edge.toContract}.` : ""}
                      {edge.toFunction ?? edge.callKind}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {edge.callKind} at {formatLocation(edge.filePath, edge.startLine, edge.endLine)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">No basic call graph edges were persisted.</div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-white">External call sites</div>
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {externalCalls.length > 0 ? (
                externalCalls.slice(0, 30).map((call) => (
                  <div key={call.id} className="rounded border border-white/10 bg-black/20 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white">
                        {call.contractName}.{call.functionName}
                      </span>
                      <Badge variant={call.lowLevel ? "red" : "blue"}>{call.callKind}</Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">{call.targetExpression ?? "Target unavailable"}</div>
                    <div className="mt-1 text-muted-foreground">
                      {formatLocation(call.filePath, call.startLine, call.endLine)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">No external call sites were persisted.</div>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-white">Storage layout</div>
            <div className="max-h-72 overflow-auto rounded border border-white/10">
              {storageLayout.length > 0 ? (
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/5 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 font-medium">Contract</th>
                      <th className="px-2 py-2 font-medium">Label</th>
                      <th className="px-2 py-2 font-medium">Slot</th>
                      <th className="px-2 py-2 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storageLayout.slice(0, 40).map((entry) => (
                      <tr key={entry.id} className="border-t border-white/10">
                        <td className="px-2 py-2 text-white">{entry.contractName}</td>
                        <td className="px-2 py-2 text-slate-300">{entry.label}</td>
                        <td className="px-2 py-2 text-muted-foreground">{entry.slot}:{entry.offset}</td>
                        <td className="px-2 py-2 text-muted-foreground">{entry.typeName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-3 text-xs text-muted-foreground">Storage layout was Not Assessed or unavailable.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function BuildIntelligenceSection({
  buildProfile,
  buildRuns,
  compilerArtifacts,
  testRuns,
  toolAvailability
}: {
  buildProfile: BuildProfile | null;
  buildRuns: BuildRun[];
  compilerArtifacts: CompilerArtifact[];
  testRuns: TestRun[];
  toolAvailability: AnalyzerToolAvailability[];
}) {
  const latestBuild = buildRuns[0];
  const latestTestRun = testRuns[0];

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-white/6 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <FileText className="h-4 w-4 text-cyan-200" />
        Build and test runner
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <MiniStat label="Build profile" value={buildProfile?.toolKind ?? "UNKNOWN"} />
        <MiniStat label="Build status" value={latestBuild?.status ?? "NOT_ASSESSED"} />
        <MiniStat label="Compiler artifacts" value={String(compilerArtifacts.length)} />
        <MiniStat label="Latest tests" value={latestTestRun?.status ?? "NOT_ASSESSED"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-white/10 bg-black/20 p-3 text-xs">
          <div className="mb-2 text-xs font-medium text-white">Profile</div>
          {buildProfile ? (
            <div className="space-y-1 text-muted-foreground">
              <div>Tool: {buildProfile.toolName}</div>
              <div>Version: {buildProfile.toolVersion ?? "Not captured"}</div>
              <div>Root: {buildProfile.projectRoot}</div>
              <div>Config: {buildProfile.configFile ?? "Not available"}</div>
              <div>{buildProfile.detectionReason}</div>
            </div>
          ) : (
            <div className="text-muted-foreground">No persisted build profile was found.</div>
          )}
        </div>
        <div className="rounded border border-white/10 bg-black/20 p-3 text-xs">
          <div className="mb-2 text-xs font-medium text-white">Build timeline</div>
          <div className="max-h-56 space-y-2 overflow-auto pr-1">
            {buildRuns.length > 0 ? (
              buildRuns.slice(0, 8).map((run) => (
                <div key={run.id} className="rounded border border-white/10 bg-white/5 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-white">{run.command}</span>
                    <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {formatDateTime(run.startedAt)} · {run.durationMs ?? 0}ms
                  </div>
                  {run.error ? <div className="mt-1 text-red-100">{run.error}</div> : null}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">No build runs persisted.</div>
            )}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-black/20 p-3 text-xs">
          <div className="mb-2 text-xs font-medium text-white">Compiler artifacts</div>
          <div className="max-h-56 space-y-2 overflow-auto pr-1">
            {compilerArtifacts.length > 0 ? (
              compilerArtifacts.slice(0, 12).map((artifact) => (
                <div key={artifact.id} className="rounded border border-white/10 bg-white/5 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-white">{artifact.artifactPath}</span>
                    <Badge variant="blue">{artifact.artifactKind}</Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {artifact.compilerVersion ?? "compiler unknown"} · {formatBytes(artifact.sizeBytes)}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">No compiler artifacts captured.</div>
            )}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-black/20 p-3 text-xs">
          <div className="mb-2 text-xs font-medium text-white">Test results</div>
          <div className="max-h-56 space-y-2 overflow-auto pr-1">
            {testRuns.length > 0 ? (
              testRuns.slice(0, 8).map((run) => (
                <div key={run.id} className="rounded border border-white/10 bg-white/5 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-white">{run.toolKind}</span>
                    <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Results: {run.results?.length ?? 0} · {run.durationMs ?? 0}ms
                  </div>
                  {run.results?.slice(0, 4).map((result) => (
                    <div key={result.id} className="mt-1 text-muted-foreground">
                      {result.status}: {result.testName}
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">No test runs persisted.</div>
            )}
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="mb-2 text-xs font-medium text-white">Tool availability</div>
          <div className="grid gap-2 md:grid-cols-3">
            {toolAvailability.length > 0 ? (
              toolAvailability.map((tool) => (
                <div key={tool.id} className="rounded border border-white/10 bg-black/20 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white">{tool.toolName}</span>
                    <Badge variant={tool.available ? "default" : statusBadgeVariant(tool.status)}>{tool.status}</Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground">{tool.toolVersion ?? tool.errorCategory ?? "No version captured"}</div>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">No tool availability rows persisted.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function AiValidationSection({ summary }: { summary: AiScanValidationSummary | null }) {
  const latest = summary?.runs[0];
  const note = latest?.reviewNotes?.[0];
  const usage = latest?.providerUsage?.[0];

  return (
    <section className="mt-4 rounded-lg border border-white/10 bg-white/6 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <BrainCircuit className="h-4 w-4 text-violet-200" />
        AI evidence validation
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <MiniStat label="Provider" value={summary?.provider.provider ?? "DISABLED"} />
        <MiniStat label="Model" value={summary?.provider.model ?? "Not configured"} />
        <MiniStat label="Status" value={summary?.status ?? "NOT_ASSESSED"} />
        <MiniStat label="Runs" value={String(summary?.runs.length ?? 0)} />
      </div>
      {summary?.provider.status === "PROVIDER_NOT_CONFIGURED" ? (
        <div className="rounded border border-white/10 bg-black/20 p-3 text-xs text-amber-100">
          AI validation is Not Assessed because no provider configuration is available.
        </div>
      ) : latest ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded border border-white/10 bg-black/20 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-medium text-white">Latest scan validation</span>
              <Badge variant={statusBadgeVariant(latest.status)}>{latest.status}</Badge>
            </div>
            <div className="space-y-1 text-muted-foreground">
              <div>{formatDateTime(latest.startedAt)}</div>
              <div>Prompt: {latest.promptVersion}</div>
              <div>Output: {latest.outputArtifactPath ?? "Not available"}</div>
              {latest.error ? <div className="text-red-100">{latest.error}</div> : null}
            </div>
          </div>
          <div className="rounded border border-white/10 bg-black/20 p-3 text-xs">
            <div className="mb-2 text-xs font-medium text-white">Scan summary</div>
            {note ? (
              <div className="space-y-2 text-muted-foreground">
                <div className="text-white">{note.title ?? note.noteType}</div>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-xs leading-5 text-slate-300">
                  {note.body}
                </pre>
              </div>
            ) : (
              <div className="text-muted-foreground">No scan-level AI summary has been persisted.</div>
            )}
          </div>
          <div className="lg:col-span-2 rounded border border-white/10 bg-black/20 p-3 text-xs">
            <div className="mb-2 text-xs font-medium text-white">Provider usage</div>
            {usage ? (
              <div className="grid gap-2 sm:grid-cols-4">
                <MiniStat label="Input tokens" value={String(usage.inputTokens ?? 0)} />
                <MiniStat label="Output tokens" value={String(usage.outputTokens ?? 0)} />
                <MiniStat label="Total tokens" value={String(usage.totalTokens ?? 0)} />
                <MiniStat label="Cost" value={usage.costEstimate ? `${usage.costEstimate} ${usage.currency ?? ""}` : "Not available"} />
              </div>
            ) : (
              <div className="text-muted-foreground">No token usage was persisted for this run.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground">
          No persisted scan-level AI validation runs are available.
        </div>
      )}
    </section>
  );
}

function FindingAiValidationPanel({ validation }: { validation: AiFindingValidationResponse | null }) {
  const latest = validation?.validations[0];
  const run = latest?.aiValidationRun ?? validation?.latestRun ?? null;

  return (
    <div className="rounded-md border border-white/10 bg-white/6 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
        <BrainCircuit className="h-4 w-4 text-violet-200" />
        AI validation
      </div>
      {!validation ? (
        <div className="text-xs text-muted-foreground">No persisted AI validation response is available.</div>
      ) : validation.provider.status === "PROVIDER_NOT_CONFIGURED" ? (
        <div className="text-xs leading-5 text-amber-100">Provider Not Configured</div>
      ) : latest ? (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={decisionBadgeVariant(latest.decision)}>{latest.decision}</Badge>
            <Badge variant={statusBadgeVariant(run?.status ?? validation.status)}>{run?.status ?? validation.status}</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <MiniStat label="False positive risk" value={`${latest.falsePositiveRisk}%`} />
            <MiniStat label="Evidence coverage" value={`${latest.evidenceCoverageScore}%`} />
            <MiniStat label="Hallucination risk" value={`${latest.hallucinationRisk}%`} />
          </div>
          <p className="leading-5 text-slate-300">{latest.reasoningSummary}</p>
          {latest.missingEvidence.length > 0 ? (
            <div>
              <div className="mb-1 text-white">Missing evidence</div>
              <ul className="space-y-1 text-muted-foreground">
                {latest.missingEvidence.slice(0, 6).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {latest.contradictionNotes ? (
            <div className="rounded border border-amber-300/20 bg-amber-500/10 p-2 text-amber-50">
              {latest.contradictionNotes}
            </div>
          ) : null}
          {latest.humanReviewerChecklist.length > 0 ? (
            <div>
              <div className="mb-1 text-white">Human review checklist</div>
              <ul className="space-y-1 text-muted-foreground">
                {latest.humanReviewerChecklist.slice(0, 8).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {latest.evidenceCritiques?.length ? (
            <div>
              <div className="mb-1 text-white">Evidence critique</div>
              <div className="space-y-2">
                {latest.evidenceCritiques.slice(0, 4).map((critique) => (
                  <div key={critique.id} className="rounded border border-white/10 bg-black/20 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{critique.evidenceReference ?? critique.findingEvidenceId}</span>
                      <Badge variant="blue">{critique.supportLevel ?? "REVIEWED"}</Badge>
                    </div>
                    <div className="text-slate-300">{critique.critique}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">AI validation is {validation.status}.</div>
      )}
    </div>
  );
}

function FindingSimulationPanel({
  finding,
  simulation,
  configReady,
  onError,
  onRefresh,
  clientFactory
}: {
  finding: Vulnerability;
  simulation: FindingSimulationResponse | null;
  configReady: boolean;
  onError: (message: string | null) => void;
  onRefresh: (findingId: string) => Promise<void>;
  clientFactory: () => AuditScannerApiClient;
}) {
  const [busy, setBusy] = React.useState(false);
  const latest = simulation?.runs[0] ?? null;
  const eligibility = latest?.eligibilityRecords?.[0] ?? null;
  const plan = latest?.plans?.[0] ?? null;
  const decision = latest?.decisions?.[0] ?? null;
  const tools = eligibility?.toolAvailability ?? [];
  const artifacts = latest?.artifacts ?? [];
  const deltas = latest?.assetDeltas ?? [];

  const runSimulation = async () => {
    if (!configReady) return;
    setBusy(true);
    onError(null);
    try {
      await clientFactory().simulateFinding(finding.id);
      await onRefresh(finding.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Simulation action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-white/10 bg-white/6 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
        <PlayCircle className="h-4 w-4 text-cyan-200" />
        Local fork simulation
      </div>
      <div className="mb-3 rounded border border-cyan-300/20 bg-cyan-500/10 p-2 text-xs leading-5 text-cyan-50">
        Simulation runs only in a local fork/test environment and does not broadcast live transactions.
      </div>
      {!simulation ? (
        <div className="space-y-3 text-xs">
          <div className="text-muted-foreground">No persisted simulation data is available.</div>
          <Button variant="secondary" disabled={busy || !configReady} onClick={() => void runSimulation()}>
            <PlayCircle className="h-4 w-4" />
            Assess simulation
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={simulation.simulation.enabled ? "default" : "neutral"}>
              {simulation.simulation.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <Badge variant="blue">{simulation.simulation.safetyLevel}</Badge>
            <Badge variant={decisionBadgeVariant(latest?.decision ?? simulation.decision)}>
              {decisionLabel(latest?.decision ?? simulation.decision)}
            </Badge>
            <Badge variant={statusBadgeVariant(latest?.status ?? simulation.status)}>{latest?.status ?? simulation.status}</Badge>
          </div>
          <div className="text-muted-foreground">
            {safeSimulationStatusMessage(latest?.decision ?? simulation.decision)}
          </div>
          {eligibility?.reason ? (
            <div className="rounded border border-amber-300/20 bg-amber-500/10 p-2 text-amber-50">
              {eligibility.reason}
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniStat label="Kind" value={latest?.kind ?? "NOT_ASSESSED"} />
            <MiniStat label="RPC provider" value={latest?.rpcProviderName ?? simulation.simulation.rpcProviderName ?? "Not configured"} />
            <MiniStat label="Fork chain" value={latest?.forkChainId ? String(latest.forkChainId) : "Not Assessed"} />
            <MiniStat label="Fork block" value={latest?.forkBlockNumber ? String(latest.forkBlockNumber) : "Not Assessed"} />
          </div>
          <Button variant="secondary" disabled={busy || !configReady} onClick={() => void runSimulation()}>
            <PlayCircle className="h-4 w-4" />
            Run local simulation
          </Button>
          {tools.length > 0 ? (
            <div>
              <div className="mb-1 text-white">Tool availability</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {tools.map((tool) => (
                  <div key={tool.toolName} className="rounded border border-white/10 bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white">{tool.toolName}</span>
                      <Badge variant={tool.available ? "default" : "red"}>{tool.status}</Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">{tool.version ?? tool.errorCategory ?? "No version captured"}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {plan ? (
            <div className="rounded border border-white/10 bg-black/20 p-2">
              <div className="mb-1 text-white">{plan.title}</div>
              <div className="text-muted-foreground">{plan.summary}</div>
              <div className="mt-1 text-muted-foreground">Plan checksum: {plan.planChecksumSha256 ?? "Not available"}</div>
              {plan.commandPreview ? <div className="mt-1 text-muted-foreground">Command: {plan.commandPreview}</div> : null}
            </div>
          ) : null}
          {decision ? (
            <div className="rounded border border-white/10 bg-black/20 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-white">Decision</span>
                <Badge variant={decisionBadgeVariant(decision.decision)}>{decisionLabel(decision.decision)}</Badge>
              </div>
              <div className="text-muted-foreground">{decision.rationale}</div>
              {decision.suggestedConfidenceAdjustment ? (
                <div className="mt-1 text-amber-100">{decision.suggestedConfidenceAdjustment}</div>
              ) : null}
            </div>
          ) : null}
          {deltas.length > 0 ? (
            <div>
              <div className="mb-1 text-white">Asset delta summary</div>
              <div className="space-y-2">
                {deltas.map((delta) => (
                  <div key={delta.id} className="rounded border border-white/10 bg-black/20 p-2 text-muted-foreground">
                    {delta.assetType}: {delta.delta} {delta.unit ?? ""} {delta.direction ?? ""}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {artifacts.length > 0 ? (
            <div>
              <div className="mb-1 text-white">Trace and artifacts</div>
              <div className="space-y-2">
                {artifacts.map((artifact) => (
                  <div key={artifact.id} className="rounded border border-white/10 bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white">{artifact.artifactType}</span>
                      <Badge variant="blue">{artifact.redacted ? "Redacted" : "Raw"}</Badge>
                    </div>
                    <div className="mt-1 break-all text-muted-foreground">{artifact.artifactPath}</div>
                    <div className="mt-1 break-all text-muted-foreground">Checksum: {artifact.checksumSha256}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {latest?.error ? <div className="rounded border border-red-400/20 bg-red-500/10 p-2 text-red-100">{latest.error}</div> : null}
        </div>
      )}
    </div>
  );
}

function FindingFuzzPanel({
  finding,
  fuzz,
  configReady,
  onError,
  onRefresh,
  clientFactory
}: {
  finding: Vulnerability;
  fuzz: FindingFuzzResponse | null;
  configReady: boolean;
  onError: (message: string | null) => void;
  onRefresh: (findingId: string) => Promise<void>;
  clientFactory: () => AuditScannerApiClient;
}) {
  const [busy, setBusy] = React.useState(false);
  const latest = fuzz?.runs[0] ?? null;
  const definitions = latest?.invariantDefinitions ?? [];
  const results = latest?.invariantResults ?? [];
  const counterexamples = latest?.counterexamples ?? [];
  const coverage = latest?.coverageSummaries?.[0] ?? null;
  const artifacts = latest?.artifacts ?? [];

  const runFuzz = async () => {
    if (!configReady) return;
    setBusy(true);
    onError(null);
    try {
      await clientFactory().fuzzFinding(finding.id);
      await onRefresh(finding.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Fuzzing action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-white/10 bg-white/6 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
        <FlaskConical className="h-4 w-4 text-emerald-200" />
        Fuzzing and invariants
      </div>
      <div className="mb-3 rounded border border-emerald-300/20 bg-emerald-500/10 p-2 text-xs leading-5 text-emerald-50">
        Fuzzing runs only in a local/sandbox environment and does not broadcast live transactions.
      </div>
      {!fuzz ? (
        <div className="space-y-3 text-xs">
          <div className="text-muted-foreground">No persisted fuzzing data is available.</div>
          <Button variant="secondary" disabled={busy || !configReady} onClick={() => void runFuzz()}>
            <FlaskConical className="h-4 w-4" />
            Assess fuzzing
          </Button>
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={fuzz.fuzzing.enabled ? "default" : "neutral"}>
              {fuzz.fuzzing.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <Badge variant="blue">{fuzz.fuzzing.safetyLevel}</Badge>
            <Badge variant={statusBadgeVariant(latest?.status ?? fuzz.status)}>{latest?.status ?? fuzz.status}</Badge>
            <Badge variant={statusBadgeVariant(latest?.invariantStatus ?? fuzz.invariantStatus)}>
              {latest?.invariantStatus ?? fuzz.invariantStatus}
            </Badge>
          </div>
          <div className="text-muted-foreground">{safeFuzzStatusMessage(latest?.status ?? fuzz.status)}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniStat label="Tool" value={latest?.toolKind ?? "UNKNOWN"} />
            <MiniStat label="Default runs" value={String(fuzz.fuzzing.defaultRuns)} />
            <MiniStat label="Gas" value={latest?.gasUsed ? String(latest.gasUsed) : "Not Assessed"} />
            <MiniStat label="Duration" value={latest?.durationMs ? `${latest.durationMs} ms` : "Not Assessed"} />
          </div>
          <Button variant="secondary" disabled={busy || !configReady} onClick={() => void runFuzz()}>
            <FlaskConical className="h-4 w-4" />
            Run local fuzzing
          </Button>
          {definitions.length > 0 ? (
            <div>
              <div className="mb-1 text-white">Invariant candidates</div>
              <div className="space-y-2">
                {definitions.slice(0, 5).map((definition) => (
                  <div key={definition.id} className="rounded border border-white/10 bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white">{definition.name}</span>
                      <Badge variant={statusBadgeVariant(definition.status)}>{definition.status}</Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">{definition.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {results.length > 0 ? (
            <div>
              <div className="mb-1 text-white">Invariant results</div>
              <div className="space-y-2">
                {results.slice(0, 4).map((result) => (
                  <div key={result.id} className="rounded border border-white/10 bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white">Result</span>
                      <Badge variant={statusBadgeVariant(result.status)}>{result.status}</Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">{result.summary}</div>
                    {result.counterexampleChecksumSha256 ? (
                      <div className="mt-1 break-all text-amber-100">Counterexample: {result.counterexampleChecksumSha256}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {counterexamples.length > 0 ? (
            <div>
              <div className="mb-1 text-white">Counterexamples</div>
              <div className="space-y-2">
                {counterexamples.map((item) => (
                  <div key={item.id} className="rounded border border-red-300/20 bg-red-500/10 p-2">
                    <div className="text-red-50">{item.summary}</div>
                    <div className="mt-1 break-all text-red-100">{item.checksumSha256 ?? item.artifactPath ?? "No artifact checksum"}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {coverage ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <MiniStat label="Line coverage" value={coverage.lineCoveragePct ? `${coverage.lineCoveragePct}%` : "Not Assessed"} />
              <MiniStat label="Function coverage" value={coverage.functionCoveragePct ? `${coverage.functionCoveragePct}%` : "Not Assessed"} />
              <MiniStat label="Branch coverage" value={coverage.branchCoveragePct ? `${coverage.branchCoveragePct}%` : "Not Assessed"} />
            </div>
          ) : null}
          {artifacts.length > 0 ? (
            <div>
              <div className="mb-1 text-white">Artifacts</div>
              <div className="space-y-2">
                {artifacts.slice(0, 5).map((artifact) => (
                  <div key={artifact.id} className="rounded border border-white/10 bg-black/20 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white">{artifact.artifactType}</span>
                      <Badge variant="blue">{artifact.redacted ? "Redacted" : "Raw"}</Badge>
                    </div>
                    <div className="mt-1 break-all text-muted-foreground">{artifact.artifactPath}</div>
                    <div className="mt-1 break-all text-muted-foreground">Checksum: {artifact.checksumSha256}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {latest?.error ? <div className="rounded border border-red-400/20 bg-red-500/10 p-2 text-red-100">{latest.error}</div> : null}
        </div>
      )}
    </div>
  );
}

function FindingRemediationPanel({
  finding,
  remediation,
  configReady,
  onError,
  onRefresh,
  clientFactory
}: {
  finding: Vulnerability;
  remediation: FindingRemediationResponse | null;
  configReady: boolean;
  onError: (message: string | null) => void;
  onRefresh: (findingId: string) => Promise<void>;
  clientFactory: () => AuditScannerApiClient;
}) {
  const [busy, setBusy] = React.useState(false);
  const latest = remediation?.runs[0] ?? null;
  const guidance = latest?.suggestions?.find((item) => item.kind === "GUIDANCE") ?? latest?.suggestions?.[0] ?? null;
  const diffs = latest?.diffs ?? [];
  const tests = latest?.testSuggestions ?? [];
  const checklist = latest?.checklistItems ?? [];
  const providerNotConfigured = remediation?.provider.status === "PROVIDER_NOT_CONFIGURED" || latest?.status === "PROVIDER_NOT_CONFIGURED";

  const runAction = async (operation: (client: AuditScannerApiClient) => Promise<unknown>) => {
    if (!configReady) return;
    setBusy(true);
    onError(null);
    try {
      await operation(clientFactory());
      await onRefresh(finding.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Remediation action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-white/10 bg-white/6 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
        <Wrench className="h-4 w-4 text-emerald-200" />
        Remediation assistant
      </div>
      {!remediation ? (
        <div className="text-xs text-muted-foreground">No persisted remediation data is available.</div>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={remediation.eligibility.eligible ? "default" : "red"}>{remediation.eligibility.status}</Badge>
            <Badge variant={statusBadgeVariant(latest?.status ?? remediation.status)}>{latest?.status ?? remediation.status}</Badge>
            <Badge variant={patchSafetyBadgeVariant(latest?.safetyStatus ?? "NOT_ASSESSED")}>
              {latest?.safetyStatus ?? "NOT_ASSESSED"}
            </Badge>
          </div>
          {remediation.eligibility.reason ? (
            <div className="rounded border border-amber-300/20 bg-amber-500/10 p-2 text-amber-50">
              {remediation.eligibility.reason}
            </div>
          ) : null}
          {providerNotConfigured ? (
            <div className="rounded border border-amber-300/20 bg-amber-500/10 p-2 text-amber-50">
              Provider Not Configured. Remediation remains Not Assessed until an AI provider is configured.
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <MiniStat label="Provider" value={remediation.provider.provider} />
            <MiniStat label="Model" value={remediation.provider.model ?? "Not configured"} />
          </div>
          <Button
            variant="secondary"
            disabled={busy || !remediation.eligibility.eligible}
            onClick={() => runAction((client) => client.remediateFinding(finding.id))}
          >
            <Wrench className="h-4 w-4" />
            Generate suggestion
          </Button>
          {latest ? (
            <div className="space-y-3">
              <div className="rounded border border-white/10 bg-black/20 p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-white">Latest remediation</span>
                  <span className="text-muted-foreground">{formatDateTime(latest.startedAt)}</span>
                </div>
                <div className="space-y-1 text-muted-foreground">
                  <div>Kind: {latest.kind}</div>
                  <div>Output: {latest.outputArtifactPath ?? "Not available"}</div>
                  <div>Requires human review</div>
                  {latest.error ? <div className="text-red-100">{latest.error}</div> : null}
                </div>
              </div>
              {guidance ? (
                <div>
                  <div className="mb-1 text-white">{guidance.title}</div>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-2 text-xs leading-5 text-slate-300">
                    {guidance.body}
                  </pre>
                </div>
              ) : null}
              {guidance?.behaviorChangeNotes.length || diffs.some((diff) => diff.behaviorChangeNotes.length > 0) ? (
                <div className="rounded border border-amber-300/20 bg-amber-500/10 p-2 text-amber-50">
                  <div className="mb-1 text-white">Behavior change warning</div>
                  {[...(guidance?.behaviorChangeNotes ?? []), ...diffs.flatMap((diff) => diff.behaviorChangeNotes)]
                    .slice(0, 6)
                    .map((note) => (
                      <div key={note}>{note}</div>
                    ))}
                </div>
              ) : null}
              {diffs.length > 0 ? (
                <div>
                  <div className="mb-1 text-white">Suggested diff</div>
                  <div className="space-y-2">
                    {diffs.map((diff) => (
                      <div key={diff.id} className="rounded border border-white/10 bg-black/20 p-2">
                        <div className="mb-1 flex items-center justify-between gap-2 text-muted-foreground">
                          <span>{formatLocation(diff.filePath, diff.originalStartLine, diff.originalEndLine)}</span>
                          <Badge variant={patchSafetyBadgeVariant(diff.safetyStatus)}>{diff.safetyStatus}</Badge>
                        </div>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-xs leading-5 text-slate-200">
                          {diff.proposedPatch}
                        </pre>
                        <div className="mt-2 text-slate-300">{diff.explanation}</div>
                        <div className="mt-1 text-amber-100">{diff.risk}</div>
                        <div className="mt-1 text-muted-foreground">Requires human review: {String(diff.requiresHumanReview)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : remediation.eligibility.guidanceOnly || !remediation.diffSuggestionsAllowed ? (
                <div className="rounded border border-white/10 bg-black/20 p-2 text-muted-foreground">
                  Guidance only: no exact source range is available for a secure diff suggestion.
                </div>
              ) : null}
              {tests.length > 0 ? (
                <div>
                  <div className="mb-1 text-white">Test suggestions</div>
                  <div className="space-y-2">
                    {tests.map((test) => (
                      <div key={test.id} className="rounded border border-white/10 bg-black/20 p-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-white">{test.title}</span>
                          <Badge variant="blue">{test.testFramework ?? "TEST"}</Badge>
                        </div>
                        <div className="text-muted-foreground">{test.description}</div>
                        {test.skeleton ? (
                          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-xs leading-5 text-slate-200">
                            {test.skeleton}
                          </pre>
                        ) : null}
                        <div className="mt-2 text-muted-foreground">Failing before: {test.expectedFailingBefore}</div>
                        <div className="mt-1 text-muted-foreground">Fixed after: {test.expectedFixedAfter}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {checklist.length > 0 ? (
                <div>
                  <div className="mb-1 text-white">Human review checklist</div>
                  <ul className="space-y-1 text-muted-foreground">
                    {checklist.map((item) => (
                      <li key={item.id}>{item.item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || !latest}
                  onClick={() => latest && runAction((client) => client.markRemediationReviewed(latest.id, "Reviewed in finding detail"))}
                >
                  Mark reviewed
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || !latest}
                  onClick={() => latest && runAction((client) => client.rejectRemediation(latest.id, "Rejected in finding detail"))}
                >
                  Reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded border border-white/10 bg-black/20 p-2 text-muted-foreground">
              No remediation runs have been persisted for this finding.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FindingCodeLinksPanel({
  finding,
  codeLinks
}: {
  finding: Vulnerability;
  codeLinks: FindingCodeLink[];
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/6 p-3">
      <div className="mb-2 text-sm font-medium text-white">Code links</div>
      <div className="mb-3 text-xs leading-5 text-muted-foreground">
        {finding.filePath ? formatLocation(finding.filePath, finding.lineStart, finding.lineEnd) : finding.title}
      </div>
      <div className="space-y-2">
        {codeLinks.length > 0 ? (
          codeLinks.map((link) => (
            <div key={link.id} className="rounded border border-white/10 bg-black/20 p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="blue">{link.linkType}</Badge>
                <span className="text-muted-foreground">{scoreValue(link.confidence)}</span>
              </div>
              <div className="mt-2 text-white">{codeLinkLabel(link)}</div>
              <div className="mt-1 text-muted-foreground">{formatLocation(link.filePath, link.startLine, link.endLine)}</div>
              {link.reason ? <div className="mt-1 text-muted-foreground">{link.reason}</div> : null}
            </div>
          ))
        ) : (
          <div className="text-xs text-muted-foreground">
            No persisted AST/source-map links were found for this finding.
          </div>
        )}
      </div>
    </div>
  );
}

function FindingCard({
  finding,
  selected,
  onSelect
}: {
  finding: Vulnerability;
  selected: boolean;
  onSelect: () => void;
}) {
  const evidence = finding.evidenceItems ?? [];
  const state = finding.confidenceState ?? "CANDIDATE";
  const reviewStatus = finding.review?.status ?? "UNREVIEWED";

  return (
    <div className={`rounded-md border p-3 ${selected ? "border-primary/60 bg-primary/10" : "border-white/10 bg-black/20"}`}>
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onSelect} className="min-w-0 text-left">
          <div className="text-sm font-medium text-white">{finding.title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {finding.filePath ?? "Unknown file"}
            {finding.lineStart ? `:${finding.lineStart}` : ""}
            {finding.lineEnd && finding.lineEnd !== finding.lineStart ? `-${finding.lineEnd}` : ""}
          </div>
        </button>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant={reviewStatus === "SUPPRESSED" ? "red" : "blue"}>{reviewStatus}</Badge>
          <Badge variant={state === "SUPPORTED" ? "default" : "blue"}>{state}</Badge>
          <Badge variant={finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "red" : "default"}>
            {finding.severity}
          </Badge>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <MiniStat label="Confidence" value={scoreValue(finding.confidenceScore)} />
        <MiniStat label="Exploitability" value={scoreValue(finding.exploitabilityScore)} />
        <MiniStat label="Priority" value={scoreValue(finding.priorityScore)} />
      </div>
      {finding.remediation ? (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{finding.remediation}</p>
      ) : null}
      <details className="mt-3 rounded-md border border-white/10 bg-white/5 p-3">
        <summary className="cursor-pointer text-xs font-medium text-white">Evidence drawer</summary>
        <div className="mt-3 space-y-3">
          {evidence.length > 0 ? (
            evidence.map((item) => (
              <div key={item.id} className="rounded border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="blue">{item.evidenceType}</Badge>
                  <span className="text-muted-foreground">
                    {item.analyzerRun?.toolName ?? item.detectorName ?? "Analyzer"}
                  </span>
                  <span className="text-muted-foreground">{item.ruleId ?? "No rule id"}</span>
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-300">
                  {item.filePath ?? "Unknown file"}
                  {item.startLine ? `:${item.startLine}` : ""}
                  {item.endLine && item.endLine !== item.startLine ? `-${item.endLine}` : ""}
                </div>
                {item.message ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.message}</p> : null}
                {item.snippet ? (
                  <pre className="mt-2 max-h-48 overflow-auto rounded bg-black/40 p-3 text-xs leading-5 text-slate-200">
                    {item.snippet}
                  </pre>
                ) : (
                  <div className="mt-2 text-xs text-amber-100">Source range or snippet quality is limited.</div>
                )}
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Raw artifact: {item.rawArtifactPath ?? "Not available"}
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-muted-foreground">No evidence rows persisted for this finding.</div>
          )}
        </div>
      </details>
    </div>
  );
}

function FindingFilters({
  reviewStatusFilter,
  setReviewStatusFilter,
  severityFilter,
  setSeverityFilter,
  confidenceFilter,
  setConfidenceFilter,
  analyzerFilter,
  setAnalyzerFilter,
  vulnerabilities
}: {
  reviewStatusFilter: "ALL" | FindingReviewStatus;
  setReviewStatusFilter: (value: "ALL" | FindingReviewStatus) => void;
  severityFilter: "ALL" | Severity;
  setSeverityFilter: (value: "ALL" | Severity) => void;
  confidenceFilter: string;
  setConfidenceFilter: (value: string) => void;
  analyzerFilter: string;
  setAnalyzerFilter: (value: string) => void;
  vulnerabilities: Vulnerability[];
}) {
  const analyzers = Array.from(new Set(vulnerabilities.map((finding) => finding.analyzer))).sort();
  const confidences = Array.from(new Set(vulnerabilities.map((finding) => finding.confidence))).sort();

  return (
    <div className="mb-4 grid gap-2 md:grid-cols-4">
      <SelectFilter
        label="Review"
        value={reviewStatusFilter}
        onChange={(value) => setReviewStatusFilter(value as "ALL" | FindingReviewStatus)}
        options={["ALL", ...reviewStatuses]}
      />
      <SelectFilter
        label="Severity"
        value={severityFilter}
        onChange={(value) => setSeverityFilter(value as "ALL" | Severity)}
        options={["ALL", ...severityOrder]}
      />
      <SelectFilter
        label="Confidence"
        value={confidenceFilter}
        onChange={setConfidenceFilter}
        options={["ALL", ...confidences]}
      />
      <SelectFilter
        label="Analyzer"
        value={analyzerFilter}
        onChange={setAnalyzerFilter}
        options={["ALL", ...analyzers]}
      />
    </div>
  );
}

function ReviewPanel({
  finding,
  configReady,
  onError,
  onRefresh,
  clientFactory
}: {
  finding: Vulnerability;
  configReady: boolean;
  onError: (message: string | null) => void;
  onRefresh: (findingId: string) => Promise<void>;
  clientFactory: () => AuditScannerApiClient;
}) {
  const [status, setStatus] = React.useState<FindingReviewStatus>(finding.review?.status ?? "UNREVIEWED");
  const [reason, setReason] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [assignee, setAssignee] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setStatus(finding.review?.status ?? "UNREVIEWED");
    setReason("");
    setComment("");
    setAssignee(finding.review?.assignedToEmail ?? finding.review?.assignedToName ?? "");
  }, [finding.id, finding.review]);

  const run = async (operation: (client: AuditScannerApiClient) => Promise<unknown>) => {
    if (!configReady) return;
    setBusy(true);
    onError(null);
    try {
      await operation(clientFactory());
      await onRefresh(finding.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Review action failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-white/10 bg-white/6 p-3">
      <div className="mb-2 text-sm font-medium text-white">Finding review</div>
      <div className="mb-3 text-xs leading-5 text-muted-foreground">{finding.title}</div>
      <div className="space-y-2">
        <SelectFilter
          label="Status"
          value={status}
          onChange={(value) => setStatus(value as FindingReviewStatus)}
          options={reviewStatuses}
        />
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason"
          className="w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-xs text-white outline-none"
        />
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            run((client) =>
              client.updateFindingReviewStatus(finding.id, {
                status,
                ...(reason ? { reason } : {})
              })
            )
          }
        >
          Save status
        </Button>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Comment"
          className="min-h-20 w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-xs text-white outline-none"
        />
        <Button
          variant="secondary"
          disabled={busy || !comment.trim()}
          onClick={() => run((client) => client.addFindingComment(finding.id, comment.trim()))}
        >
          Add comment
        </Button>
        <input
          value={assignee}
          onChange={(event) => setAssignee(event.target.value)}
          placeholder="Owner email or name"
          className="w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-xs text-white outline-none"
        />
        <Button
          variant="secondary"
          disabled={busy || !assignee.trim()}
          onClick={() =>
            run((client) =>
              assignee.includes("@")
                ? client.assignFinding(finding.id, {
                    assigneeEmail: assignee.trim(),
                    ...(reason ? { reason } : {})
                  })
                : client.assignFinding(finding.id, {
                    assigneeName: assignee.trim(),
                    ...(reason ? { reason } : {})
                  })
            )
          }
        >
          Assign
        </Button>
        {finding.review?.status === "SUPPRESSED" ? (
          <Button variant="secondary" disabled={busy} onClick={() => run((client) => client.unsuppressFinding(finding.id, reason || undefined))}>
            Unsuppress
          </Button>
        ) : (
          <Button variant="secondary" disabled={busy || !reason.trim()} onClick={() => run((client) => client.suppressFinding(finding.id, reason.trim()))}>
            Suppress
          </Button>
        )}
      </div>
      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="mb-2 text-xs font-medium text-white">Audit trail</div>
        <div className="space-y-2">
          {finding.review?.events?.length ? (
            finding.review.events.map((event) => (
              <div key={event.id} className="rounded border border-white/10 bg-black/20 p-2 text-xs">
                <div className="flex items-center justify-between gap-2 text-white">
                  <span>{event.action}</span>
                  <span className="text-muted-foreground">{formatDateTime(event.createdAt)}</span>
                </div>
                <div className="mt-1 text-muted-foreground">Actor: {event.actorUserId ?? "API key/system"}</div>
                <div className="mt-1 text-muted-foreground">Previous: {formatJson(event.previousValue)}</div>
                <div className="mt-1 text-muted-foreground">New: {formatJson(event.newValue)}</div>
                {event.reason ? <div className="mt-1 text-slate-300">{event.reason}</div> : null}
              </div>
            ))
          ) : (
            <div className="text-xs text-muted-foreground">No review events persisted yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SelectFilter({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-2 text-xs text-white outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

const reviewStatuses: FindingReviewStatus[] = [
  "UNREVIEWED",
  "NEEDS_REVIEW",
  "ACCEPTED",
  "FALSE_POSITIVE",
  "RISK_ACCEPTED",
  "FIXED",
  "WONT_FIX",
  "DUPLICATE",
  "SUPPRESSED"
];

function formatJson(value: Record<string, unknown> | null | undefined): string {
  return value ? JSON.stringify(value) : "None";
}

function formatLocation(filePath?: string | null, startLine?: number | null, endLine?: number | null): string {
  if (!filePath) {
    return "Location Not Assessed";
  }
  if (!startLine) {
    return filePath;
  }
  return `${filePath}:${startLine}${endLine && endLine !== startLine ? `-${endLine}` : ""}`;
}

function codeLinkLabel(link: FindingCodeLink): string {
  if (link.functionSymbol) {
    return link.functionSymbol.canonicalName;
  }
  if (link.contractSymbol) {
    return link.contractSymbol.fullyQualifiedName;
  }
  if (link.externalCallSite) {
    return `${link.externalCallSite.contractName}.${link.externalCallSite.functionName} ${link.externalCallSite.callKind}`;
  }
  if (link.storageLayoutEntry) {
    return `${link.storageLayoutEntry.contractName}.${link.storageLayoutEntry.label}`;
  }
  return link.linkType;
}

function statusBadgeVariant(status: string): "default" | "red" | "amber" | "blue" | "neutral" {
  if (status === "SUCCEEDED" || status === "PASSED" || status === "AVAILABLE" || status === "REPRODUCED") {
    return "default";
  }
  if (status === "FAILED" || status === "TOOL_NOT_INSTALLED") {
    return "red";
  }
  if (status === "TIMEOUT" || status === "NOT_ASSESSED" || status === "PROVIDER_NOT_CONFIGURED") {
    return "amber";
  }
  if (status === "RUNNING" || status === "QUEUED") {
    return "blue";
  }
  return "neutral";
}

function decisionBadgeVariant(decision: string): "default" | "red" | "amber" | "blue" | "neutral" {
  if (decision === "EVIDENCE_STRONG" || decision === "EVIDENCE_MEDIUM" || decision === "REPRODUCED") {
    return "default";
  }
  if (decision === "LIKELY_FALSE_POSITIVE" || decision === "CONTRADICTED") {
    return "red";
  }
  if (decision === "EVIDENCE_WEAK" || decision === "NOT_ENOUGH_EVIDENCE" || decision === "INCONCLUSIVE" || decision === "NOT_ASSESSED") {
    return "amber";
  }
  if (decision === "NEEDS_HUMAN_REVIEW" || decision === "NOT_REPRODUCED") {
    return "blue";
  }
  return "neutral";
}

function decisionLabel(decision: string): string {
  if (decision === "REPRODUCED") return "Reproduced";
  if (decision === "NOT_REPRODUCED") return "Not Reproduced";
  if (decision === "INCONCLUSIVE") return "Inconclusive";
  if (decision === "NOT_ASSESSED") return "Not Assessed";
  return decision;
}

function patchSafetyBadgeVariant(status: string): "default" | "red" | "amber" | "blue" | "neutral" {
  if (status === "SAFE_TO_REVIEW") {
    return "default";
  }
  if (status === "UNSAFE") {
    return "red";
  }
  if (status === "NEEDS_HUMAN_REVIEW" || status === "BEHAVIOR_CHANGING") {
    return "amber";
  }
  return "neutral";
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/5 px-2 py-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold text-white">{value}</div>
    </div>
  );
}

function scoreValue(value: number | string | undefined): string {
  return value === undefined ? "0" : toNumber(value).toFixed(0);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/6 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
