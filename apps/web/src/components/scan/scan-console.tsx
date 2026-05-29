"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, FileArchive, Github, Globe2, KeyRound, Play, ShieldAlert, StopCircle, UploadCloud } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LiveProgressPanel } from "@/components/scan/live-progress-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AuditScannerApiClient, hasWorkspaceConfig, type SimpleWebsiteScanResponse } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";

const analyzers = ["slither", "mythril", "semgrep", "aderyn", "foundry"] as const;
type Analyzer = (typeof analyzers)[number];
type ScanMode = "repository" | "website" | "upload" | "contract" | "advanced";

const modeCards: Array<{ mode: ScanMode; title: string; desc: string; icon: React.ComponentType<{ className?: string }> }> = [
  { mode: "repository", title: "GitHub repo URL", desc: "Public GitHub source fetch → artifact → queue", icon: Github },
  { mode: "website", title: "Live website URL", desc: "Safe passive header/TLS scan only", icon: Globe2 },
  { mode: "upload", title: "Upload ZIP/folder", desc: "Browser extracts ZIP/folder → source artifact", icon: UploadCloud },
  { mode: "contract", title: "Smart contract address", desc: "Explorer verified source → scan", icon: ShieldAlert },
  { mode: "advanced", title: "Advanced artifact", desc: "Manual artifact key / existing scan tools", icon: KeyRound }
];

export function ScanConsole() {
  const { config } = useWorkspaceConfig();
  const [mode, setMode] = React.useState<ScanMode>("repository");
  const [scanId, setScanId] = React.useState("");
  const [title, setTitle] = React.useState("My security scan");
  const [repositoryUrl, setRepositoryUrl] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [chainId, setChainId] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [artifactKey, setArtifactKey] = React.useState("");
  const [selectedAnalyzers, setSelectedAnalyzers] = React.useState<Analyzer[]>(["semgrep"]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  const [websiteResult, setWebsiteResult] = React.useState<SimpleWebsiteScanResponse | null>(null);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);

  React.useEffect(() => {
    if (mode === "website") setSelectedAnalyzers(["semgrep"]);
    if (mode === "repository") setSelectedAnalyzers(["semgrep"]);
    if (mode === "contract") setSelectedAnalyzers(["slither", "semgrep", "aderyn", "foundry"]);
    if (mode === "upload") setSelectedAnalyzers(["semgrep"]);
  }, [mode]);

  const client = React.useMemo(() => (hasWorkspaceConfig(config) ? new AuditScannerApiClient(config) : null), [config]);

  const startScan = async () => {
    if (!client) {
      setError("Workspace configuration incomplete: set API URL, organization ID, and access token/API key from top-right Workspace panel or /login.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);
    setWebsiteResult(null);

    try {
      if (mode === "repository") {
        const queued = await client.startSimplePublicRepositoryScan({ title, repositoryUrl, analyzers: selectedAnalyzers });
        setScanId(queued.scan?.id ?? "");
        setResult(`Repository scan queued. Scan ID: ${queued.scan?.id ?? "not returned"}`);
      } else if (mode === "website") {
        const passive = await client.passiveWebsiteScan({ url: websiteUrl });
        setWebsiteResult(passive);
        setResult(`Passive website scan completed. Score: ${passive.summary.score}/100`);
      } else if (mode === "upload") {
        const files = await collectUploadFiles(selectedFiles);
        const queued = await client.startSimpleSourceUploadScan({ title, analyzers: selectedAnalyzers, files });
        setScanId(queued.scan?.id ?? "");
        setResult(`Upload scan queued. Scan ID: ${queued.scan?.id ?? "not returned"}`);
      } else if (mode === "contract") {
        const queued = await client.scanVerifiedContractFromExplorer(chainId, address, { title, priority: "NORMAL" });
        setScanId(queued.scan?.id ?? "");
        setResult(`Verified contract scan queued. Scan ID: ${queued.scan?.id ?? "not returned"}`);
      } else {
        const scan = await client.createScan({
          title,
          priority: "NORMAL",
          analyzers: selectedAnalyzers,
          target: {
            type: "SOURCE",
            artifactKey
          }
        });
        setScanId(scan.id);
        setResult(`Advanced artifact scan queued. Scan ID: ${scan.id}`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start scan");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelScan = async () => {
    if (!scanId || !client) return;
    await client.cancelScan(scanId);
    setResult("Cancel request sent.");
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Badge variant="blue" className="mb-3">Simple scan page</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Start a real-only security scan</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Paste a GitHub repo, website URL, upload a source folder/ZIP, or fetch verified smart-contract source. Advanced fields stay hidden unless you open Advanced artifact mode.
        </p>
      </div>

      <div className="mb-4 rounded-md border border-amber-300/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-50">
        Web3Guard AI is a pre-audit readiness scanner, not a certified audit. Missing Slither/Semgrep/Foundry/Aderyn tools are reported honestly as Tool Not Installed / Not Assessed.
      </div>

      {error ? <div className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
      {result ? <div className="mb-4 rounded-md border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{result}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
        <Card>
          <CardHeader><CardTitle>Scan target</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {modeCards.map((item) => {
                const Icon = item.icon;
                const active = mode === item.mode;
                return (
                  <button
                    key={item.mode}
                    type="button"
                    onClick={() => setMode(item.mode)}
                    className={`rounded-lg border p-4 text-left transition ${active ? "border-primary bg-primary/10" : "border-white/10 bg-white/5 hover:bg-white/8"}`}
                  >
                    <Icon className="mb-3 h-5 w-5 text-primary" />
                    <div className="font-medium text-white">{item.title}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.desc}</div>
                  </button>
                );
              })}
            </div>

            <Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>

            {mode === "repository" ? (
              <Field label="GitHub repository URL">
                <Input placeholder="https://github.com/owner/repo" value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} />
              </Field>
            ) : null}

            {mode === "website" ? (
              <Field label="Live website URL">
                <Input placeholder="https://your-site.vercel.app" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} />
              </Field>
            ) : null}

            {mode === "upload" ? (
              <div className="space-y-3">
                <Field label="Upload source folder or ZIP">
                  <Input
                    type="file"
                    multiple
                    accept=".zip,.sol,.ts,.tsx,.js,.jsx,.json,.toml,.yaml,.yml,.lock,.py,.go,.rs"
                    onChange={(event) => setSelectedFiles(Array.from(event.currentTarget.files ?? []))}
                  />
                </Field>
                <input
                  type="file"
                  multiple
                  // @ts-expect-error webkitdirectory is supported by Chromium-based browsers for folder upload.
                  webkitdirectory="true"
                  onChange={(event) => setSelectedFiles(Array.from(event.currentTarget.files ?? []))}
                  className="block w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                />
                <p className="text-xs text-muted-foreground">Selected files: {selectedFiles.length}. ZIP files are extracted in-browser before upload.</p>
              </div>
            ) : null}

            {mode === "contract" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Chain UUID"><Input value={chainId} onChange={(event) => setChainId(event.target.value)} placeholder="From Settings → Chains" /></Field>
                <Field label="Contract address"><Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x..." /></Field>
              </div>
            ) : null}

            {mode === "advanced" ? (
              <Field label="Artifact key"><Textarea value={artifactKey} onChange={(event) => setArtifactKey(event.target.value.trim())} className="min-h-20" /></Field>
            ) : null}

            {mode !== "website" ? (
              <Field label="Analyzers">
                <div className="flex flex-wrap gap-2">
                  {analyzers.map((analyzer) => {
                    const selected = selectedAnalyzers.includes(analyzer);
                    return (
                      <Button key={analyzer} type="button" variant={selected ? "default" : "secondary"} onClick={() => setSelectedAnalyzers((current) => selected ? current.filter((value) => value !== analyzer) : [...current, analyzer])}>
                        {analyzer}
                      </Button>
                    );
                  })}
                </div>
              </Field>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={() => void startScan()} disabled={submitting || (mode !== "website" && selectedAnalyzers.length === 0)}>
                <Play className="h-4 w-4" />
                {submitting ? "Starting..." : mode === "website" ? "Run passive scan" : "Start scan"}
              </Button>
              <Button variant="secondary" onClick={() => void cancelScan()} disabled={!scanId}><StopCircle className="h-4 w-4" />Cancel</Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <LiveProgressPanel config={config} scanId={scanId} />
          <WebsiteResultCard result={websiteResult} />
          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-200" />
              <div className="text-sm leading-6 text-muted-foreground">
                Live website scan is passive only. It does not run brute force, exploit chains, RCE, DoS, credential attacks, file writes, wallet signing, or private-key collection.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function WebsiteResultCard({ result }: { result: SimpleWebsiteScanResponse | null }) {
  if (!result) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Website passive result · {result.summary.score}/100</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {result.checks.map((check) => (
          <div key={check.id} className="rounded-md border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              {check.status === "pass" ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
              {check.title}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Evidence: {check.evidence}</div>
            {check.remediation ? <div className="mt-1 text-xs text-amber-100">Fix: {check.remediation}</div> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

async function collectUploadFiles(files: File[]) {
  const collected: Array<{ path: string; contentBase64: string }> = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".zip")) {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      for (const [entryName, entry] of Object.entries(zip.files)) {
        if (entry.dir || shouldSkipPath(entryName)) continue;
        const content = await entry.async("base64");
        collected.push({ path: sanitizeUploadPath(entryName), contentBase64: content });
      }
      continue;
    }

    const path = sanitizeUploadPath(file.webkitRelativePath || file.name);
    if (shouldSkipPath(path)) continue;
    collected.push({ path, contentBase64: await fileToBase64(file) });
  }
  if (collected.length === 0) throw new Error("No supported upload files selected");
  return collected.slice(0, 5000);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read upload file"));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",").pop() ?? "" : value);
    };
    reader.readAsDataURL(file);
  });
}

function sanitizeUploadPath(value: string) {
  return value.replace(/\\/gu, "/").replace(/^\/+/, "").replace(/\.\.(\/|$)/gu, "");
}

function shouldSkipPath(path: string) {
  return /(^|\/)(node_modules|\.git|dist|build|\.next|coverage)(\/|$)/u.test(path);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}
