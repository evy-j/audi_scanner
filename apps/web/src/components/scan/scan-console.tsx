"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Github,
  Globe2,
  KeyRound,
  Play,
  ShieldAlert,
  StopCircle,
  UploadCloud
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LiveProgressPanel } from "@/components/scan/live-progress-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AuditScannerApiClient, hasWorkspaceConfig, type SimpleWebsiteScanResponse } from "@/lib/api-client";
import type { Scan } from "@/types/api";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";

const analyzers = ["slither", "mythril", "semgrep", "aderyn", "foundry"] as const;
type Analyzer = (typeof analyzers)[number];
type ScanMode = "repository" | "website" | "upload" | "contract" | "advanced";

type SavedScanDraft = {
  mode: ScanMode;
  title: string;
  repositoryUrl: string;
  websiteUrl: string;
  chainId: string;
  address: string;
  artifactKey: string;
  selectedAnalyzers: Analyzer[];
  scanId: string;
};

type ScanHistoryItem = {
  id: string;
  title: string;
  mode: ScanMode;
  target: string;
  status: string;
  createdAt: string;
};

const draftKey = "audit-scanner.scan-draft.v2";
const historyKey = "audit-scanner.scan-history.v2";

const modeCards: Array<{ mode: ScanMode; title: string; desc: string; icon: React.ComponentType<{ className?: string }> }> = [
  { mode: "repository", title: "GitHub repo URL", desc: "Public GitHub source fetch → artifact → queue", icon: Github },
  { mode: "website", title: "Live website URL", desc: "Safe passive header/TLS scan only", icon: Globe2 },
  { mode: "upload", title: "Upload ZIP/folder", desc: "Browser extracts ZIP/folder → source artifact", icon: UploadCloud },
  { mode: "contract", title: "Smart contract address", desc: "Explorer verified source → scan", icon: ShieldAlert },
  { mode: "advanced", title: "Advanced artifact", desc: "Manual artifact key / existing scan tools", icon: KeyRound }
];

const defaultDraft: SavedScanDraft = {
  mode: "repository",
  title: "My security scan",
  repositoryUrl: "",
  websiteUrl: "",
  chainId: "",
  address: "",
  artifactKey: "",
  selectedAnalyzers: ["semgrep"],
  scanId: ""
};

export function ScanConsole() {
  const { config, ready } = useWorkspaceConfig();
  const [draft, setDraft] = React.useState<SavedScanDraft>(() => readDraft());
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  const [websiteResult, setWebsiteResult] = React.useState<SimpleWebsiteScanResponse | null>(null);
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [history, setHistory] = React.useState<ScanHistoryItem[]>(() => readHistory());
  const [currentScan, setCurrentScan] = React.useState<Scan | null>(null);
  const [pollNote, setPollNote] = React.useState<string | null>(null);

  const client = React.useMemo(() => (hasWorkspaceConfig(config) ? new AuditScannerApiClient(config) : null), [config]);
  const connected = ready && Boolean(client);

  React.useEffect(() => {
    writeDraft(draft);
  }, [draft]);

  React.useEffect(() => {
    window.localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 12)));
  }, [history]);

  React.useEffect(() => {
    if (!client || !draft.scanId) {
      setCurrentScan(null);
      setPollNote(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const scan = await client.getScan(draft.scanId);
        if (cancelled) return;
        setCurrentScan(scan);
        setPollNote(`Last status refresh: ${new Date().toLocaleTimeString()}`);
        setHistory((items) => upsertHistory(items, {
          id: scan.id,
          title: scan.title || draft.title,
          mode: draft.mode,
          target: targetLabel(draft),
          status: String(scan.status ?? "UNKNOWN"),
          createdAt: scan.createdAt || new Date().toISOString()
        }));
      } catch (cause) {
        if (!cancelled) setPollNote(cause instanceof Error ? cause.message : "Unable to refresh scan status");
      }
    };
    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, draft.scanId, draft.mode, draft.title]);

  const updateDraft = (next: Partial<SavedScanDraft>) => setDraft((current) => ({ ...current, ...next }));

  const selectMode = (mode: ScanMode) => {
    updateDraft({ mode, selectedAnalyzers: defaultAnalyzersForMode(mode) });
    setError(null);
    setResult(null);
    setWebsiteResult(null);
  };

  const startScan = async () => {
    if (!client) {
      setError("Login/workspace missing. Open /login once; it will create/load your Supabase-backed user + organization and save the workspace automatically.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);
    setWebsiteResult(null);
    setCurrentScan(null);

    try {
      if (draft.mode === "repository") {
        requireValue(draft.repositoryUrl, "Paste a GitHub repository URL first.");
        const queued = await client.startSimplePublicRepositoryScan({ title: draft.title, repositoryUrl: draft.repositoryUrl, analyzers: draft.selectedAnalyzers });
        const id = queued.scan?.id ?? "";
        updateDraft({ scanId: id });
        rememberQueuedScan(id, "repository", draft.title, draft.repositoryUrl, String(queued.scan?.status ?? queued.status));
        setResult(`Repository scan queued. Scan ID: ${id || "not returned"}. Progress will continue below even after page refresh.`);
      } else if (draft.mode === "website") {
        requireValue(draft.websiteUrl, "Paste a website URL first.");
        const passive = await client.passiveWebsiteScan({ url: draft.websiteUrl });
        setWebsiteResult(passive);
        setResult(`Passive website scan completed. Score: ${passive.summary.score}/100. This scan is safe/passive only.`);
      } else if (draft.mode === "upload") {
        if (selectedFiles.length === 0) throw new Error("Choose a ZIP/source folder/files before starting upload scan.");
        const files = await collectUploadFiles(selectedFiles);
        const queued = await client.startSimpleSourceUploadScan({ title: draft.title, analyzers: draft.selectedAnalyzers, files });
        const id = queued.scan?.id ?? "";
        updateDraft({ scanId: id });
        rememberQueuedScan(id, "upload", draft.title, `${files.length} uploaded files`, String(queued.scan?.status ?? queued.status));
        setResult(`Upload scan queued from ${files.length} file(s). Scan ID: ${id || "not returned"}.`);
      } else if (draft.mode === "contract") {
        requireValue(draft.chainId, "Chain UUID is required. Open Settings → Chains and copy the chain ID.");
        requireValue(draft.address, "Contract address is required.");
        const queued = await client.scanVerifiedContractFromExplorer(draft.chainId, draft.address, { title: draft.title, priority: "NORMAL" });
        const id = queued.scan?.id ?? "";
        updateDraft({ scanId: id });
        rememberQueuedScan(id, "contract", draft.title, draft.address, String(queued.scan?.status ?? queued.status ?? "QUEUED"));
        setResult(`Verified contract source scan queued. Scan ID: ${id || "not returned"}.`);
      } else {
        requireValue(draft.artifactKey, "Artifact key is required in advanced mode.");
        const scan = await client.createScan({
          title: draft.title,
          priority: "NORMAL",
          analyzers: draft.selectedAnalyzers,
          target: { type: "SOURCE", artifactKey: draft.artifactKey }
        });
        updateDraft({ scanId: scan.id });
        rememberQueuedScan(scan.id, "advanced", draft.title, draft.artifactKey, String(scan.status ?? "QUEUED"));
        setResult(`Advanced artifact scan queued. Scan ID: ${scan.id}.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start scan");
    } finally {
      setSubmitting(false);
    }
  };

  const rememberQueuedScan = (id: string, mode: ScanMode, title: string, target: string, status: string) => {
    if (!id) return;
    setHistory((items) => upsertHistory(items, { id, mode, title, target, status, createdAt: new Date().toISOString() }));
  };

  const cancelScan = async () => {
    if (!draft.scanId || !client) return;
    await client.cancelScan(draft.scanId);
    setResult("Cancel request sent.");
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Badge variant="blue" className="mb-3">Simple scan workflow</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Start a real-only security scan</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Login once, then paste a GitHub repo, run a safe website scan, upload ZIP/folder, or fetch verified smart-contract source. Your draft + last scan ID stay saved when you switch pages.
        </p>
      </div>

      {!connected ? <LoginRequiredCard /> : null}
      <div className="mb-4 rounded-md border border-amber-300/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-50">
        Real-only rule: missing Slither/Semgrep/Foundry/Aderyn tools are reported as Tool Not Installed / Not Assessed. No fake vulnerability output is generated.
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
                const active = draft.mode === item.mode;
                return (
                  <button key={item.mode} type="button" onClick={() => selectMode(item.mode)} className={`rounded-lg border p-4 text-left transition ${active ? "border-primary bg-primary/10" : "border-white/10 bg-white/5 hover:bg-white/8"}`}>
                    <Icon className="mb-3 h-5 w-5 text-primary" />
                    <div className="font-medium text-white">{item.title}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.desc}</div>
                  </button>
                );
              })}
            </div>

            <Field label="Title"><Input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} /></Field>

            {draft.mode === "repository" ? (
              <Field label="GitHub repository URL">
                <Input placeholder="https://github.com/owner/repo" value={draft.repositoryUrl} onChange={(event) => updateDraft({ repositoryUrl: event.target.value })} />
              </Field>
            ) : null}

            {draft.mode === "website" ? (
              <Field label="Live website URL">
                <Input placeholder="https://your-site.vercel.app" value={draft.websiteUrl} onChange={(event) => updateDraft({ websiteUrl: event.target.value })} />
              </Field>
            ) : null}

            {draft.mode === "upload" ? (
              <div className="space-y-3">
                <Field label="Upload ZIP or source files">
                  <Input type="file" multiple accept=".zip,.sol,.ts,.tsx,.js,.jsx,.json,.toml,.yaml,.yml,.lock,.py,.go,.rs" onChange={(event) => setSelectedFiles(Array.from(event.currentTarget.files ?? []))} />
                </Field>
                <Field label="Or upload source folder">
                  <input type="file" multiple // @ts-expect-error Chromium folder upload attribute
                    webkitdirectory="true" onChange={(event) => setSelectedFiles(Array.from(event.currentTarget.files ?? []))} className="block w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200" />
                </Field>
                <p className="text-xs text-muted-foreground">Selected files: {selectedFiles.length}. Browser file selections cannot be restored after refresh for privacy, but all other form data stays saved.</p>
              </div>
            ) : null}

            {draft.mode === "contract" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Chain UUID"><Input value={draft.chainId} onChange={(event) => updateDraft({ chainId: event.target.value })} placeholder="From Settings → Chains" /></Field>
                <Field label="Contract address"><Input value={draft.address} onChange={(event) => updateDraft({ address: event.target.value })} placeholder="0x..." /></Field>
              </div>
            ) : null}

            {draft.mode === "advanced" ? (
              <Field label="Artifact key"><Textarea value={draft.artifactKey} onChange={(event) => updateDraft({ artifactKey: event.target.value.trim() })} className="min-h-20" /></Field>
            ) : null}

            {draft.mode !== "website" ? (
              <Field label="Analyzers">
                <div className="flex flex-wrap gap-2">
                  {analyzers.map((analyzer) => {
                    const selected = draft.selectedAnalyzers.includes(analyzer);
                    return <Button key={analyzer} type="button" variant={selected ? "default" : "secondary"} onClick={() => updateDraft({ selectedAnalyzers: selected ? draft.selectedAnalyzers.filter((value) => value !== analyzer) : [...draft.selectedAnalyzers, analyzer] })}>{analyzer}</Button>;
                  })}
                </div>
              </Field>
            ) : null}

            <div className="flex flex-wrap gap-3 pt-2">
              <Button onClick={() => void startScan()} disabled={!connected || submitting || (draft.mode !== "website" && draft.selectedAnalyzers.length === 0)}>
                <Play className="h-4 w-4" />{submitting ? "Starting..." : draft.mode === "website" ? "Run passive scan" : "Start scan"}
              </Button>
              <Button variant="secondary" onClick={() => void cancelScan()} disabled={!draft.scanId || !client}><StopCircle className="h-4 w-4" />Cancel</Button>
              <Button variant="ghost" type="button" onClick={() => updateDraft({ ...defaultDraft })}>Reset draft</Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <CurrentScanCard scanId={draft.scanId} scan={currentScan} note={pollNote} />
          <LiveProgressPanel config={config} scanId={draft.scanId} />
          <WebsiteResultCard result={websiteResult} />
          <HistoryCard history={history} onSelect={(id) => updateDraft({ scanId: id })} />
          <Card><CardContent className="flex items-start gap-3 p-4"><AlertTriangle className="mt-0.5 h-4 w-4 text-amber-200" /><div className="text-sm leading-6 text-muted-foreground">Live website scan is passive only. It does not run brute force, exploit chains, RCE, DoS, credential attacks, file writes, wallet signing, or private-key collection.</div></CardContent></Card>
        </div>
      </div>
    </AppShell>
  );
}

function LoginRequiredCard() {
  return (
    <Card className="mb-4 border-amber-300/20 bg-amber-500/10">
      <CardContent className="flex flex-col justify-between gap-3 p-4 md:flex-row md:items-center">
        <div>
          <div className="font-medium text-amber-50">Login/workspace required before scans</div>
          <div className="mt-1 text-sm text-amber-100/80">Use /login once. It creates/loads your Supabase-backed user + organization and saves API URL, token, and org ID automatically.</div>
        </div>
        <Button asChild><Link href="/login">Open login</Link></Button>
      </CardContent>
    </Card>
  );
}

function CurrentScanCard({ scanId, scan, note }: { scanId: string; scan: Scan | null; note: string | null }) {
  if (!scanId) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Current scan</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="break-all text-muted-foreground">ID: <span className="text-white">{scanId}</span></div>
        <div>Status: <Badge variant="neutral">{scan?.status ?? "refreshing"}</Badge></div>
        {scan?.title ? <div>Title: <span className="text-white">{scan.title}</span></div> : null}
        {note ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{note}</div> : null}
      </CardContent>
    </Card>
  );
}

function HistoryCard({ history, onSelect }: { history: ScanHistoryItem[]; onSelect: (id: string) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Recent scan history</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {history.map((item) => (
          <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="w-full rounded-md border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10">
            <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-white">{item.title}</span><Badge variant="neutral">{item.status}</Badge></div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{item.mode}: {item.target}</div>
          </button>
        ))}
        {history.length === 0 ? <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">No queued scans in this browser yet.</div> : null}
      </CardContent>
    </Card>
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

function readDraft(): SavedScanDraft {
  if (typeof window === "undefined") return defaultDraft;
  const saved = window.localStorage.getItem(draftKey);
  if (!saved) return defaultDraft;
  try {
    return { ...defaultDraft, ...(JSON.parse(saved) as Partial<SavedScanDraft>) };
  } catch {
    window.localStorage.removeItem(draftKey);
    return defaultDraft;
  }
}

function writeDraft(value: SavedScanDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(draftKey, JSON.stringify(value));
}

function readHistory(): ScanHistoryItem[] {
  if (typeof window === "undefined") return [];
  const saved = window.localStorage.getItem(historyKey);
  if (!saved) return [];
  try {
    return JSON.parse(saved) as ScanHistoryItem[];
  } catch {
    window.localStorage.removeItem(historyKey);
    return [];
  }
}

function upsertHistory(items: ScanHistoryItem[], item: ScanHistoryItem) {
  return [item, ...items.filter((value) => value.id !== item.id)].slice(0, 12);
}

function defaultAnalyzersForMode(mode: ScanMode): Analyzer[] {
  if (mode === "contract") return ["slither", "semgrep", "aderyn", "foundry"];
  if (mode === "website") return ["semgrep"];
  return ["semgrep"];
}

function targetLabel(draft: SavedScanDraft) {
  if (draft.mode === "repository") return draft.repositoryUrl;
  if (draft.mode === "website") return draft.websiteUrl;
  if (draft.mode === "contract") return draft.address;
  if (draft.mode === "advanced") return draft.artifactKey;
  return "upload";
}

function requireValue(value: string, message: string) {
  if (!value.trim()) throw new Error(message);
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
