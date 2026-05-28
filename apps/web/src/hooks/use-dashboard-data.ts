"use client";

import * as React from "react";
import { AuditScannerApiClient, hasWorkspaceConfig, type WorkspaceConfig } from "@/lib/api-client";
import type { AuditReport, DetectorPrecisionMetric, MonitorAlert, MonitorTarget, MonitoringState, ProjectWebhook, Scan, ScanThreatSummary, UsageSummary, Vulnerability } from "@/types/api";

export interface DashboardData {
  scans: Scan[];
  vulnerabilities: Vulnerability[];
  reports: AuditReport[];
  usage: UsageSummary | null;
  monitoring: {
    state: MonitoringState | null;
    targets: MonitorTarget[];
    alerts: MonitorAlert[];
    webhooks: ProjectWebhook[];
    latestRunStatus?: string | null;
  };
  threatKnowledge: {
    summary: ScanThreatSummary | null;
    precision: DetectorPrecisionMetric[];
  };
}

export function useDashboardData(config: WorkspaceConfig) {
  const [data, setData] = React.useState<DashboardData>({
    scans: [],
    vulnerabilities: [],
    reports: [],
    usage: null,
    monitoring: {
      state: null,
      targets: [],
      alerts: [],
      webhooks: []
    },
    threatKnowledge: {
      summary: null,
      precision: []
    }
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!hasWorkspaceConfig(config)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const client = new AuditScannerApiClient(config);
      const [scans, vulnerabilities, reports, usageResult] = await Promise.allSettled([
        client.listScans(25),
        client.listVulnerabilities({ limit: 100 }),
        client.listReports(20),
        client.getUsageSummary()
      ]);
      const scanList = scans.status === "fulfilled" ? scans.value : [];
      const latestScan = scanList[0] ?? null;
      const projectId = scanList.find((scan) => scan.projectId)?.projectId ?? null;
      const [targets, alerts, webhooks] = projectId
        ? await Promise.allSettled([
            client.listMonitorTargets(projectId),
            client.listProjectAlerts(projectId),
            client.listProjectWebhooks(projectId)
          ])
        : [null, null, null] as const;
      const [threatSummary, detectorPrecision] = await Promise.allSettled([
        latestScan ? client.getThreatSummary(latestScan.id) : Promise.resolve(null),
        client.listDetectorPrecision(50)
      ]);
      const monitoringTargets = targets?.status === "fulfilled" ? targets.value.targets : [];
      const monitoringAlerts = alerts?.status === "fulfilled" ? alerts.value.alerts : [];
      const webhookList = webhooks?.status === "fulfilled" ? webhooks.value.webhooks : [];
      const summary = threatSummary?.status === "fulfilled" ? threatSummary.value : null;
      const precision = detectorPrecision?.status === "fulfilled" ? detectorPrecision.value.metrics : [];
      setData({
        scans: scanList,
        vulnerabilities: vulnerabilities.status === "fulfilled" ? vulnerabilities.value : [],
        reports: reports.status === "fulfilled" ? reports.value : [],
        usage: usageResult.status === "fulfilled" ? usageResult.value : null,
        monitoring: {
          state: targets?.status === "fulfilled" ? targets.value.monitoring : null,
          targets: monitoringTargets,
          alerts: monitoringAlerts,
          webhooks: webhookList,
          latestRunStatus: monitoringTargets.flatMap((target) => target.runs ?? [])[0]?.status ?? null
        },
        threatKnowledge: {
          summary,
          precision
        }
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [config]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
