"use client";

import * as React from "react";
import { Play, ShieldAlert, StopCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LiveProgressPanel } from "@/components/scan/live-progress-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AuditScannerApiClient, hasWorkspaceConfig } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";

const analyzers = ["slither", "mythril", "semgrep", "aderyn", "foundry"] as const;
const targetTypes = [
  { type: "SOURCE", label: "SOURCE", disabled: false },
  { type: "BYTECODE", label: "BYTECODE", disabled: true },
  { type: "ADDRESS", label: "ADDRESS", disabled: true },
  { type: "REPOSITORY", label: "REPOSITORY", disabled: true }
] as const;

export function ScanConsole() {
  const { config } = useWorkspaceConfig();
  const [scanId, setScanId] = React.useState("");
  const [title, setTitle] = React.useState("Protocol audit");
  const [chainId, setChainId] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [repositoryUrl, setRepositoryUrl] = React.useState("");
  const [artifactKey, setArtifactKey] = React.useState("");
  const [targetType, setTargetType] = React.useState<"ADDRESS" | "REPOSITORY" | "SOURCE" | "BYTECODE">("SOURCE");
  const [selectedAnalyzers, setSelectedAnalyzers] = React.useState<Array<(typeof analyzers)[number]>>(["slither", "mythril", "semgrep"]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const createScan = async () => {
    if (!hasWorkspaceConfig(config)) {
      setError("Workspace configuration is incomplete");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const client = new AuditScannerApiClient(config);
      const scan = await client.createScan({
        title,
        priority: "NORMAL",
        analyzers: selectedAnalyzers,
        target: {
          type: targetType,
          ...(chainId ? { chainId } : {}),
          ...(address ? { address } : {}),
          ...(repositoryUrl ? { repositoryUrl } : {}),
          ...(artifactKey ? { artifactKey } : {})
        }
      });
      setScanId(scan.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create scan");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelScan = async () => {
    if (!scanId || !hasWorkspaceConfig(config)) {
      return;
    }
    const client = new AuditScannerApiClient(config);
    await client.cancelScan(scanId);
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Badge variant="blue" className="mb-3">Scan operations</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Launch a smart contract audit</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Queue distributed analyzers, stream worker progress, and collect normalized vulnerability evidence.
        </p>
      </div>

      {error ? <div className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      <div className="mb-4 rounded-md border border-amber-300/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-50">
        Web3Guard AI is a pre-audit readiness scanner. It is not a certified audit. Findings and remediation suggestions require human security review before production use.
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Scan request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Title">
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </Field>
            <Field label="Target type">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {targetTypes.map(({ type, label, disabled }) => (
                  <Button
                    key={type}
                    type="button"
                    variant={targetType === type ? "default" : "secondary"}
                    disabled={disabled}
                    onClick={() => setTargetType(type)}
                    title={disabled ? `${label} scans are not implemented in P0` : undefined}
                  >
                    <span>{label}</span>
                    {disabled ? <span className="text-[10px] uppercase text-muted-foreground">Not implemented</span> : null}
                  </Button>
                ))}
              </div>
            </Field>
            <Field label="Chain ID">
              <Input value={chainId} onChange={(event) => setChainId(event.target.value)} />
            </Field>
            {targetType === "ADDRESS" ? (
              <Field label="Contract address">
                <Input value={address} onChange={(event) => setAddress(event.target.value)} />
              </Field>
            ) : null}
            {targetType === "REPOSITORY" ? (
              <Field label="Repository URL">
                <Input value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} />
              </Field>
            ) : null}
            {targetType === "SOURCE" || targetType === "BYTECODE" ? (
              <Field label="Artifact key">
                <Input value={artifactKey} onChange={(event) => setArtifactKey(event.target.value)} />
              </Field>
            ) : null}
            <Field label="Analyzers">
              <div className="flex flex-wrap gap-2">
                {analyzers.map((analyzer) => {
                  const selected = selectedAnalyzers.includes(analyzer);
                  return (
                    <Button
                      key={analyzer}
                      type="button"
                      variant={selected ? "default" : "secondary"}
                      onClick={() =>
                        setSelectedAnalyzers((current) =>
                          selected ? current.filter((value) => value !== analyzer) : [...current, analyzer]
                        )
                      }
                    >
                      {analyzer}
                    </Button>
                  );
                })}
              </div>
            </Field>
            <Field label="Existing scan ID">
              <Textarea value={scanId} onChange={(event) => setScanId(event.target.value.trim())} className="min-h-16" />
            </Field>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={() => void createScan()} disabled={submitting || selectedAnalyzers.length === 0}>
                <Play className="h-4 w-4" />
                Start scan
              </Button>
              <Button variant="secondary" onClick={() => void cancelScan()} disabled={!scanId}>
                <StopCircle className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <LiveProgressPanel config={config} scanId={scanId} />
          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-200" />
              <div className="text-sm leading-6 text-muted-foreground">
                Scan execution runs through the backend queue and isolated worker containers. Frontend state reflects accepted jobs and realtime Redis pub/sub events.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
