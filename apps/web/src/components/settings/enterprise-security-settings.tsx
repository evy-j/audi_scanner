"use client";

import * as React from "react";
import { Database, KeyRound, Lock, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AuditScannerApiClient, hasWorkspaceConfig } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";
import { formatDateTime } from "@/lib/utils";
import type { DataRetentionPolicy, EnterpriseAuditLogs, OrganizationMember, ProjectMember, Scan, SecuritySetting, SsoConnection } from "@/types/api";

export function EnterpriseSecuritySettings() {
  const { config } = useWorkspaceConfig();
  const [members, setMembers] = React.useState<OrganizationMember[]>([]);
  const [projectMembers, setProjectMembers] = React.useState<ProjectMember[]>([]);
  const [settings, setSettings] = React.useState<SecuritySetting | null>(null);
  const [sso, setSso] = React.useState<SsoConnection | null>(null);
  const [retention, setRetention] = React.useState<DataRetentionPolicy | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<EnterpriseAuditLogs | null>(null);
  const [scans, setScans] = React.useState<Scan[]>([]);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [deletionReason, setDeletionReason] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!hasWorkspaceConfig(config)) return;
    const client = new AuditScannerApiClient(config);
    const scanList = await client.listScans(20).catch(() => []);
    const projectId = scanList.find((scan) => scan.projectId)?.projectId ?? null;
    const [memberResult, settingResult, ssoResult, retentionResult, auditResult, projectMemberResult] = await Promise.allSettled([
      client.listOrganizationMembers(),
      client.getSecuritySettings(),
      client.getSso(),
      client.getDataRetention(),
      client.getAuditLogs(),
      projectId ? client.listProjectMembers(projectId) : Promise.resolve([])
    ]);
    setScans(scanList);
    setMembers(memberResult.status === "fulfilled" ? memberResult.value : []);
    setSettings(settingResult.status === "fulfilled" ? settingResult.value : null);
    setSso(ssoResult.status === "fulfilled" ? ssoResult.value : null);
    setRetention(retentionResult.status === "fulfilled" ? retentionResult.value : null);
    setAuditLogs(auditResult.status === "fulfilled" ? auditResult.value : null);
    setProjectMembers(projectMemberResult.status === "fulfilled" ? projectMemberResult.value : []);
    const denied = [memberResult, settingResult, ssoResult, retentionResult, auditResult].find((item) => item.status === "rejected");
    setMessage(denied ? "Permission denied or enterprise settings are unavailable for this workspace." : null);
  }, [config]);

  React.useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load enterprise settings"));
  }, [load]);

  const toggle = async (key: keyof Pick<SecuritySetting, "publicReportSharingAllowed" | "webhookAllowed" | "simulationAllowed" | "fuzzingAllowed" | "monitoringAllowed" | "require2fa">) => {
    if (!settings || !hasWorkspaceConfig(config)) return;
    const client = new AuditScannerApiClient(config);
    setSettings(await client.updateSecuritySettings({ [key]: !settings[key] }));
  };

  const invite = async () => {
    if (!inviteEmail || !hasWorkspaceConfig(config)) return;
    const client = new AuditScannerApiClient(config);
    await client.inviteOrganizationMember({ email: inviteEmail, roleType: "VIEWER" });
    setInviteEmail("");
    await load();
  };

  const saveRetention = async () => {
    if (!retention || !hasWorkspaceConfig(config)) return;
    const client = new AuditScannerApiClient(config);
    setRetention(await client.updateDataRetention({
      scanArtifactRetentionDays: retention.scanArtifactRetentionDays,
      reportRetentionDays: retention.reportRetentionDays,
      auditLogRetentionDays: retention.auditLogRetentionDays
    }));
  };

  const requestDeletion = async () => {
    if (deletionReason.trim().length < 10 || !hasWorkspaceConfig(config)) return;
    const client = new AuditScannerApiClient(config);
    await client.createDataDeletionRequest({ reason: deletionReason.trim(), scope: "ORGANIZATION" });
    setDeletionReason("");
    setMessage("Deletion request queued for review.");
  };

  const requestExport = async () => {
    if (!hasWorkspaceConfig(config)) return;
    await new AuditScannerApiClient(config).createDataExportRequest({ scope: "ORGANIZATION", reason: "User-requested organization export" });
    setMessage("Export request queued for review.");
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Badge variant="blue" className="mb-3">Enterprise security</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Security controls</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Tenant isolation, access governance, audit visibility, SSO readiness, and data retention controls for the active organization.
        </p>
      </div>

      {message ? <div className="mb-4 rounded-md border border-white/10 bg-white/8 p-3 text-sm text-slate-200">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle>Members & roles</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="auditor@example.com" />
              <Button onClick={() => void invite()} disabled={!inviteEmail}>Invite</Button>
            </div>
            {members.slice(0, 8).map((member) => (
              <Row key={member.id} icon={Users} title={member.user?.email ?? member.invitedEmail ?? member.userId} detail={`${member.roleType} / ${member.status}`} />
            ))}
            {members.length === 0 ? <Empty label="No organization members returned." /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Security settings</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {settings ? ([
              ["require2fa", "Require 2FA"],
              ["publicReportSharingAllowed", "Public sharing"],
              ["webhookAllowed", "Webhooks"],
              ["simulationAllowed", "Simulation"],
              ["fuzzingAllowed", "Fuzzing"],
              ["monitoringAllowed", "Monitoring"]
            ] as const).map(([key, label]) => (
              <Button key={key} variant={settings[key] ? "default" : "secondary"} onClick={() => void toggle(key)}>
                <ShieldCheck className="h-4 w-4" />
                {label}: {settings[key] ? "On" : "Off"}
              </Button>
            )) : <Empty label="Security settings unavailable." />}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>SSO settings</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row icon={Lock} title={sso?.status ?? "NOT_CONFIGURED"} detail={sso?.activeLoginFlow ? "Login flow active" : "Configured-not-active; login flow is not enabled"} />
            <div className="text-muted-foreground">{sso?.issuerUrl ?? "No issuer persisted"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Data retention</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {retention ? (
              <>
                <NumberField label="Scan artifacts" value={retention.scanArtifactRetentionDays} onChange={(value) => setRetention({ ...retention, scanArtifactRetentionDays: value })} />
                <NumberField label="Reports" value={retention.reportRetentionDays} onChange={(value) => setRetention({ ...retention, reportRetentionDays: value })} />
                <NumberField label="Audit logs" value={retention.auditLogRetentionDays} onChange={(value) => setRetention({ ...retention, auditLogRetentionDays: value })} />
                <Button variant="secondary" onClick={() => void saveRetention()}>Save retention</Button>
              </>
            ) : <Empty label="Retention policy unavailable." />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Export/delete requests</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Button variant="secondary" onClick={() => void requestExport()}><Database className="h-4 w-4" /> Request export</Button>
            <Textarea value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} placeholder="Reason for deletion request" />
            <Button variant="destructive" onClick={() => void requestDeletion()} disabled={deletionReason.trim().length < 10}>Queue deletion request</Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle>Project access</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {projectMembers.slice(0, 8).map((member) => (
              <Row key={member.id} icon={KeyRound} title={member.user?.email ?? member.userId} detail={`${member.roleType} / ${member.status}`} />
            ))}
            {projectMembers.length === 0 ? <Empty label={scans.some((scan) => scan.projectId) ? "No project members returned." : "No project selected from scans."} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Audit logs</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[...(auditLogs?.admin ?? []), ...(auditLogs?.apiKeys ?? []), ...(auditLogs?.access ?? [])].slice(0, 10).map((log, index) => (
              <div key={`${String(log.id ?? index)}`} className="rounded-md border border-white/10 bg-white/5 p-3 text-xs">
                <div className="text-white">{String(log.action ?? log.decision ?? "AUDIT_EVENT")}</div>
                <div className="mt-1 text-muted-foreground">{formatDateTime(String(log.createdAt ?? new Date().toISOString()))}</div>
              </div>
            ))}
            {!auditLogs || ((auditLogs.admin.length + auditLogs.apiKeys.length + auditLogs.access.length) === 0) ? <Empty label="No audit logs returned." /> : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Row({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 p-3">
      <Icon className="h-4 w-4 text-sky-200" />
      <div className="min-w-0">
        <div className="truncate text-sm text-white">{title}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <Input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-md border border-dashed border-white/10 p-4 text-center text-sm text-muted-foreground">{label}</div>;
}
