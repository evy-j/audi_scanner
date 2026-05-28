"use client";

import * as React from "react";
import { Database, Github, Play, TerminalSquare, UploadCloud, Workflow, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditScannerApiClient, hasWorkspaceConfig } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";
import { formatDateTime } from "@/lib/utils";
import type { GitHubAppStatus, GitHubInstallation, GitHubRepository } from "@/types/api";

export function GitHubCiSettings() {
  const { config } = useWorkspaceConfig();
  const [status, setStatus] = React.useState<GitHubAppStatus | null>(null);
  const [installations, setInstallations] = React.useState<GitHubInstallation[]>([]);
  const [repositories, setRepositories] = React.useState<GitHubRepository[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busyRepo, setBusyRepo] = React.useState<string | null>(null);
  const [ingestingRepo, setIngestingRepo] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!hasWorkspaceConfig(config)) return;
    const client = new AuditScannerApiClient(config);
    const [statusResult, installationResult, repoResult] = await Promise.allSettled([
      client.getGitHubStatus(),
      client.listGitHubInstallations(),
      client.listRepositories()
    ]);
    setStatus(statusResult.status === "fulfilled" ? statusResult.value : null);
    setInstallations(installationResult.status === "fulfilled" ? installationResult.value.installations : []);
    setRepositories(repoResult.status === "fulfilled" ? repoResult.value.repositories : []);
    const denied = [statusResult, installationResult, repoResult].find((item) => item.status === "rejected");
    setMessage(denied ? "Permission denied or GitHub integration data is unavailable." : null);
  }, [config]);

  React.useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load GitHub integration"));
  }, [load]);

  const scan = async (repo: GitHubRepository) => {
    if (!hasWorkspaceConfig(config)) return;
    setBusyRepo(repo.id);
    try {
      const result = await new AuditScannerApiClient(config).scanRepository(repo.id, {
        ...(repo.defaultBranch ? { branch: repo.defaultBranch } : {})
      });
      setMessage(`Scan bridge returned ${result.status}.`);
      await load();
    } finally {
      setBusyRepo(null);
    }
  };

  const ingest = async (repo: GitHubRepository) => {
    if (!hasWorkspaceConfig(config)) return;
    setIngestingRepo(repo.id);
    try {
      const result = await new AuditScannerApiClient(config).ingestRepository(repo.id, {
        ...(repo.defaultBranch ? { branch: repo.defaultBranch } : {})
      });
      setMessage(`Source ingestion returned ${result.status}.`);
      await load();
    } finally {
      setIngestingRepo(null);
    }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Badge variant="blue" className="mb-3">GitHub and CI/CD</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Developer integrations</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Connect real GitHub installations, request repository scans, and wire Web3Guard into CI without executing exploits or fabricating scan results.
        </p>
      </div>

      {message ? <div className="mb-4 rounded-md border border-white/10 bg-white/8 p-3 text-sm text-slate-200">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader><CardTitle>GitHub App status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <StatusLine icon={Github} title={status?.message ?? "Not assessed"} detail={status?.configured ? status.appName ?? "Configured" : "GitHub App not configured"} />
            <StatusLine icon={Workflow} title={installations[0]?.status ?? "Configured, not installed"} detail={installations[0]?.accountLogin ?? "No real installation record returned"} />
            {status && !status.configured ? (
              <div className="rounded-md border border-amber-400/20 bg-amber-400/8 p-3 text-xs text-amber-100">
                Missing: {status.missing.join(", ") || "none"}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Connected repositories</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {repositories.map((repo) => {
              const latest = repo.repositoryScans?.[0];
              return (
                <div key={repo.id} className="flex flex-col gap-3 rounded-md border border-white/10 bg-white/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{repo.repoFullName}</div>
                    <div className="text-xs text-muted-foreground">
                      {repo.status} / {repo.defaultBranch ?? "default branch not persisted"} / latest {latest?.status ?? "Not assessed"}
                    </div>
                    {latest?.sourceArtifactId ? (
                      <div className="mt-1 text-xs text-sky-100">Artifact stored: {latest.sourceArtifactId}</div>
                    ) : null}
                    {latest ? <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(latest.createdAt)}</div> : null}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => void ingest(repo)} disabled={ingestingRepo === repo.id || repo.status !== "CONNECTED"}>
                      <Database className="h-4 w-4" />
                      Ingest
                    </Button>
                    <Button onClick={() => void scan(repo)} disabled={busyRepo === repo.id || repo.status !== "CONNECTED"}>
                      <Play className="h-4 w-4" />
                      Scan
                    </Button>
                  </div>
                </div>
              );
            })}
            {repositories.length === 0 ? <Empty label="No connected repositories returned." /> : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>CLI</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <StatusLine icon={TerminalSquare} title="Required environment" detail="WEB3GUARD_API_URL, WEB3GUARD_API_KEY, WEB3GUARD_ORG_ID, optional WEB3GUARD_PROJECT_ID" />
            <CodeBlock value={"web3guard auth status\nweb3guard scan path . --format json --output web3guard-report.json\nweb3guard ci --path . --json-out web3guard-report.json --sarif-out web3guard.sarif"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>GitHub Actions</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <StatusLine icon={UploadCloud} title="Required secrets" detail="WEB3GUARD_API_URL and WEB3GUARD_API_KEY" />
            <div className="text-muted-foreground">
              SARIF upload runs only when a SARIF file exists and GitHub code scanning is available for the repository.
            </div>
            <CodeBlock value={"uses: actions/checkout@v4\nrun: npx @web3guard/cli ci --path . --repo ${{ github.repository }} --json-out web3guard-report.json --sarif-out web3guard.sarif"} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StatusLine({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
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

function CodeBlock({ value }: { value: string }) {
  return <pre className="overflow-x-auto rounded-md border border-white/10 bg-slate-950/70 p-3 text-xs text-slate-200">{value}</pre>;
}

function Empty({ label }: { label: string }) {
  return <div className="rounded-md border border-dashed border-white/10 p-4 text-center text-sm text-muted-foreground">{label}</div>;
}
