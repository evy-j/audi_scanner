"use client";

import * as React from "react";
import { Activity, AlertTriangle, Bell, BookOpenCheck, FileText, Radio, ShieldCheck, Webhook } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { MetricCard } from "@/components/dashboard/metric-card";
import {
  AttackSurfaceVisualization,
  RiskTrendGraph,
  ScanAnalyticsChart,
  SeverityDistributionChart,
  VulnerabilityTimeline,
  createSeverityCounts
} from "@/components/visualizations";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";
import { AuditScannerApiClient, hasWorkspaceConfig } from "@/lib/api-client";
import { monitoringBadgeVariant, safeMonitoringStatusMessage } from "@/lib/monitoring-status";
import { safeThreatConfidenceLabel, safeThreatMatchLabel, threatConfidenceBadgeVariant } from "@/lib/threat-confidence";
import { compactAddress, formatDateTime, toNumber } from "@/lib/utils";
import type { Severity } from "@/types/api";

export function DashboardOverview() {
  const { config, ready } = useWorkspaceConfig();
  const { data, loading, error, refresh } = useDashboardData(config);
  const severityCounts = createSeverityCounts(data.vulnerabilities);
  const activeScans = data.scans.filter((scan) => !["COMPLETED", "FAILED", "CANCELED"].includes(scan.status));
  const maxRisk = Math.max(0, ...data.scans.map((scan) => toNumber(scan.riskScore)));
  const highFindings = severityCounts.critical + severityCounts.high;
  const latestScan = data.scans[0];
  const monitorProjectId = data.scans.find((scan) => scan.projectId)?.projectId ?? null;
  const threatSummary = data.threatKnowledge.summary;
  const feedbackFinding = data.vulnerabilities[0] ?? null;
  const [falsePositiveReason, setFalsePositiveReason] = React.useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = React.useState(false);

  const runAiValidate = async () => {
    if (!latestScan || !hasWorkspaceConfig(config)) return;
    await new AuditScannerApiClient(config).validateScanWithAi(latestScan.id);
    await refresh();
  };

  const runMonitorOnce = async () => {
    if (!monitorProjectId || !hasWorkspaceConfig(config)) return;
    await new AuditScannerApiClient(config).runMonitorOnce(monitorProjectId);
    await refresh();
  };

  const submitFalsePositiveFeedback = async () => {
    if (!feedbackFinding || falsePositiveReason.trim().length < 10 || !hasWorkspaceConfig(config)) return;
    setFeedbackSubmitting(true);
    try {
      await new AuditScannerApiClient(config).createFalsePositiveFeedback(feedbackFinding.id, {
        reason: falsePositiveReason.trim(),
        evidenceIds: feedbackFinding.evidenceItems?.map((item) => item.id) ?? [],
        confidence: "MEDIUM"
      });
      setFalsePositiveReason("");
      await refresh();
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Badge variant="blue" className="mb-3">Public beta</Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Operational risk overview</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Scan throughput, vulnerability severity, and audit report readiness across the active organization.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link href="/scan">New Scan</Link></Button>
          <Button asChild variant="secondary"><Link href="/reports/latest">View Reports</Link></Button>
          <Button variant="secondary" onClick={() => void refresh()} disabled={loading || !ready}>Refresh</Button>
        </div>
      </div>

      <div className="mb-4 rounded-md border border-amber-300/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-50">
        Web3Guard AI is a pre-audit readiness scanner. It is not a certified audit. Findings and remediation suggestions require human security review before production use.
      </div>

      {error ? <div className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total scans" value={String(data.scans.length)} detail={`${activeScans.length} active workloads`} icon={Activity} tone="blue" />
        <MetricCard label="High exposure" value={String(highFindings)} detail="Critical and high severity findings" icon={AlertTriangle} tone="red" />
        <MetricCard label="Max risk" value={maxRisk.toFixed(0)} detail="Highest scan risk score" icon={ShieldCheck} tone={maxRisk >= 70 ? "red" : "primary"} />
        <MetricCard label="Reports" value={String(data.reports.length)} detail="Generated audit reports" icon={FileText} tone="amber" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="secondary"><Link href="/reports/latest">Export</Link></Button>
        <Button variant="secondary" disabled={!latestScan || loading} onClick={() => void runAiValidate()}>AI Validate</Button>
        <Button asChild variant="secondary"><Link href="/reports/latest">Remediate</Link></Button>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Usage quota</CardTitle>
        </CardHeader>
        <CardContent>
          {data.usage ? (
            <div className="grid gap-3 md:grid-cols-5">
              {data.usage.counters.map((counter) => (
                <div key={counter.metric} className="rounded border border-white/10 bg-white/5 p-3">
                  <div className="text-[11px] uppercase text-muted-foreground">{counter.metric.replace(/_/gu, " ")}</div>
                  <div className="mt-1 text-lg font-semibold text-white">{counter.used}/{counter.limit}</div>
                  <div className="text-xs text-muted-foreground">{counter.remaining} remaining</div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="Usage counters are not available for this workspace." />
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>On-chain monitoring</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={monitoringBadgeVariant(data.monitoring.state?.status ?? data.monitoring.latestRunStatus)}>
              {safeMonitoringStatusMessage(data.monitoring.state?.status ?? data.monitoring.latestRunStatus)}
            </Badge>
            <Button variant="secondary" onClick={() => void runMonitorOnce()} disabled={!monitorProjectId || loading}>
              <Radio className="mr-2 h-4 w-4" />
              Run Once
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <MonitorStat label="Targets" value={String(data.monitoring.targets.length)} detail={data.monitoring.state?.providerName ?? "RPC Not Configured"} icon={Radio} />
            <MonitorStat label="Rules" value={String(data.monitoring.targets.reduce((count, target) => count + (target.rules?.length ?? 0), 0))} detail="Persisted rule watches" icon={ShieldCheck} />
            <MonitorStat label="Alerts" value={String(data.monitoring.alerts.length)} detail={`${data.monitoring.alerts.filter((alert) => alert.status === "OPEN").length} open`} icon={Bell} />
            <MonitorStat label="Webhooks" value={String(data.monitoring.webhooks.length)} detail={data.monitoring.state?.webhooksEnabled ? "Delivery enabled" : "Delivery disabled"} icon={Webhook} />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-white/10">
                    <th className="py-3 font-medium">Target</th>
                    <th className="py-3 font-medium">Kind</th>
                    <th className="py-3 font-medium">Status</th>
                    <th className="py-3 font-medium">Cursor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monitoring.targets.slice(0, 6).map((target) => (
                    <tr key={target.id} className="border-b border-white/5">
                      <td className="py-3 text-white">{compactAddress(target.normalizedAddress)}</td>
                      <td className="py-3 text-muted-foreground">{target.kind}</td>
                      <td className="py-3"><Badge variant={monitoringBadgeVariant(target.status)}>{safeMonitoringStatusMessage(target.status)}</Badge></td>
                      <td className="py-3 text-muted-foreground">{target.cursors?.[0]?.lastProcessedBlock?.toString() ?? "Not Assessed"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && data.monitoring.targets.length === 0 ? <EmptyState label={data.monitoring.state?.status === "DISABLED" ? "Monitoring Disabled" : "No monitor targets persisted"} /> : null}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-white/10">
                    <th className="py-3 font-medium">Alert</th>
                    <th className="py-3 font-medium">Severity</th>
                    <th className="py-3 font-medium">Evidence</th>
                    <th className="py-3 font-medium">Webhook</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monitoring.alerts.slice(0, 6).map((alert) => (
                    <tr key={alert.id} className="border-b border-white/5 align-top">
                      <td className="max-w-[260px] py-3">
                        <div className="truncate text-white">{alert.title}</div>
                        <div className="text-xs text-muted-foreground">{compactAddress(alert.targetAddress)} {alert.blockNumber ? `block ${alert.blockNumber}` : "Not Assessed"}</div>
                      </td>
                      <td className="py-3"><SeverityBadge severity={alert.severity as Severity} /></td>
                      <td className="py-3 text-muted-foreground">
                        {alert.transactionHash ? compactAddress(alert.transactionHash) : "Not Assessed"}
                        {typeof alert.logIndex === "number" ? ` / log ${alert.logIndex}` : ""}
                      </td>
                      <td className="py-3 text-muted-foreground">{alert.webhookDeliveries?.[0]?.status ?? "Not Assessed"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && data.monitoring.alerts.length === 0 ? <EmptyState label="No persisted monitoring alerts" /> : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Threat intelligence</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <ThreatStat label="Matches" value={String(threatSummary?.matchCount ?? 0)} detail={`${threatSummary?.highConfidenceMatches ?? 0} high confidence`} />
            <ThreatStat label="Intel entries" value={String(threatSummary?.threatIntelEntryCount ?? 0)} detail="Provenance-backed only" />
            <ThreatStat label="Precision" value={String(data.threatKnowledge.precision.length)} detail="Persisted detector metrics" />
            <ThreatStat label="Feedback" value={String(threatSummary?.falsePositiveFeedbackCount ?? 0)} detail="False-positive records" />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.85fr]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-white/10">
                    <th className="py-3 font-medium">Signature</th>
                    <th className="py-3 font-medium">Match</th>
                    <th className="py-3 font-medium">Evidence</th>
                    <th className="py-3 font-medium">Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {(threatSummary?.matches ?? []).slice(0, 6).map((match) => (
                    <tr key={match.id} className="border-b border-white/5 align-top">
                      <td className="max-w-[280px] py-3">
                        <div className="truncate text-white">{match.signature.name}</div>
                        <div className="text-xs text-muted-foreground">{match.signature.kind}</div>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={threatConfidenceBadgeVariant(match.confidence)}>{safeThreatConfidenceLabel(match.confidence)}</Badge>
                          <Badge variant="neutral">{safeThreatMatchLabel(match.status)}</Badge>
                        </div>
                      </td>
                      <td className="max-w-[260px] py-3 text-muted-foreground">{match.evidenceIdsUsed.join(", ") || "Not Assessed"}</td>
                      <td className="max-w-[240px] py-3 text-muted-foreground">{match.missingEvidence.join(", ") || "None"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && (threatSummary?.matches.length ?? 0) === 0 ? <EmptyState label="No persisted threat signature matches" /> : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">Detector precision</div>
                  <BookOpenCheck className="h-4 w-4 text-sky-200" />
                </div>
                <div className="space-y-2">
                  {data.threatKnowledge.precision.slice(0, 4).map((metric) => (
                    <div key={metric.id} className="rounded border border-white/10 p-2 text-xs">
                      <div className="truncate text-white">{metric.analyzer ?? "UNKNOWN"} / {metric.ruleId ?? "UNKNOWN"}</div>
                      <div className="text-muted-foreground">precision {toNumber(metric.precisionEstimate).toFixed(2)} · tp {metric.truePositiveCount} · fp {metric.falsePositiveCount}</div>
                    </div>
                  ))}
                  {!loading && data.threatKnowledge.precision.length === 0 ? <div className="text-sm text-muted-foreground">No detector precision metrics persisted.</div> : null}
                </div>
              </div>

              <div className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="mb-2 text-sm font-medium text-white">False-positive feedback</div>
                <Textarea
                  value={falsePositiveReason}
                  onChange={(event) => setFalsePositiveReason(event.target.value)}
                  placeholder={feedbackFinding ? `Reason for ${feedbackFinding.title}` : "No finding selected"}
                  disabled={!feedbackFinding || feedbackSubmitting}
                  className="min-h-[88px]"
                />
                <Button
                  className="mt-3"
                  variant="secondary"
                  disabled={!feedbackFinding || falsePositiveReason.trim().length < 10 || feedbackSubmitting}
                  onClick={() => void submitFalsePositiveFeedback()}
                >
                  Submit Feedback
                </Button>
              </div>
            </div>
          </div>

          {threatSummary?.limitations?.length ? (
            <div className="mt-4 rounded-md border border-white/10 bg-white/5 p-3 text-xs leading-5 text-muted-foreground">
              {threatSummary.limitations.join(" ")}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Risk trend</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-72" /> : <RiskTrendGraph scans={data.scans} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Severity distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-56" /> : <SeverityDistributionChart counts={severityCounts} />}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>Scan analytics</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-64" /> : <ScanAnalyticsChart scans={data.scans} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vulnerability timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-72" /> : <VulnerabilityTimeline vulnerabilities={data.vulnerabilities} />}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Attack surface</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-72" /> : <AttackSurfaceVisualization vulnerabilities={data.vulnerabilities} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Scan history</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-white/10">
                    <th className="py-3 font-medium">Scan</th>
                    <th className="py-3 font-medium">Status</th>
                    <th className="py-3 font-medium">Risk</th>
                    <th className="py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scans.map((scan) => (
                    <tr key={scan.id} className="border-b border-white/5">
                      <td className="py-3 text-white">{scan.title ?? scan.id}</td>
                      <td className="py-3"><StatusBadge status={scan.status} /></td>
                      <td className="py-3">{toNumber(scan.riskScore).toFixed(0)}</td>
                      <td className="py-3 text-muted-foreground">{formatDateTime(scan.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!loading && data.scans.length === 0 ? <EmptyState label="No scans available" /> : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Vulnerability dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-white/10">
                  <th className="py-3 font-medium">Finding</th>
                  <th className="py-3 font-medium">Severity</th>
                  <th className="py-3 font-medium">Category</th>
                  <th className="py-3 font-medium">Location</th>
                  <th className="py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.vulnerabilities.slice(0, 8).map((vulnerability) => (
                  <tr key={vulnerability.id} className="border-b border-white/5">
                    <td className="max-w-[280px] truncate py-3 text-white">{vulnerability.title}</td>
                    <td className="py-3"><SeverityBadge severity={vulnerability.severity} /></td>
                    <td className="py-3 text-muted-foreground">{vulnerability.category}</td>
                    <td className="max-w-[260px] truncate py-3 text-muted-foreground">
                      {vulnerability.filePath ?? "Not available"}
                      {typeof vulnerability.lineStart === "number" ? `:${vulnerability.lineStart}` : ""}
                    </td>
                    <td className="py-3 text-muted-foreground">{vulnerability.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && data.vulnerabilities.length === 0 ? <EmptyState label="No vulnerabilities available" /> : null}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: "red" | "default" | "blue" =
    status === "FAILED" || status === "CANCELED" ? "red" : status === "COMPLETED" ? "default" : "blue";
  return <Badge variant={variant}>{status}</Badge>;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const variant: "red" | "amber" | "blue" | "default" =
    severity === "CRITICAL" || severity === "HIGH"
      ? "red"
      : severity === "MEDIUM"
        ? "amber"
        : severity === "LOW"
          ? "blue"
          : "default";
  return <Badge variant={variant}>{severity}</Badge>;
}

function MonitorStat({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Radio }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-sky-200" />
      </div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function ThreatStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">{label}</div>;
}
