"use client";

import * as React from "react";
import { Boxes, ExternalLink, Network, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditScannerApiClient, hasWorkspaceConfig } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";
import type { ChainRegistryItem, ChainRegistryResponse } from "@/types/api";

export function ChainRegistrySettings() {
  const { config } = useWorkspaceConfig();
  const [data, setData] = React.useState<ChainRegistryResponse | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!hasWorkspaceConfig(config)) return;
    const client = new AuditScannerApiClient(config);
    client
      .listChains()
      .then(setData)
      .catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load chain registry"));
  }, [config]);

  const chains = data?.chains ?? [];
  const evmCount = chains.filter((chain) => chain.chainType === "EVM").length;
  const executable = chains.filter((chain) => hasFeature(chain, "simulation", "SUPPORTED") || hasFeature(chain, "monitoring", "SUPPORTED")).length;

  return (
    <AppShell>
      <div className="mb-6">
        <Badge variant="blue" className="mb-3">P14 Multi-chain</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Chain registry</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Multi-chain metadata, explorer configuration, feature support, and redacted RPC references. P14 does not persist raw RPC URLs or pretend non-EVM adapters are executable.
        </p>
      </div>

      {message ? <div className="mb-4 rounded-md border border-amber-400/20 bg-amber-400/8 p-3 text-sm text-amber-100">{message}</div> : null}

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <SummaryCard icon={Network} title="Chains" value={String(chains.length)} detail="Seeded or persisted registry entries" />
        <SummaryCard icon={Boxes} title="EVM chains" value={String(evmCount)} detail="Executable analyzer path currently centers on EVM" />
        <SummaryCard icon={ShieldCheck} title="Execution-aware" value={String(executable)} detail="Has supported monitoring/simulation metadata" />
      </div>

      <ExplorerContractTool />

      <Card>
        <CardHeader><CardTitle>Supported chain registry</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {chains.map((chain) => <ChainRow key={chain.id} chain={chain} />)}
          {chains.length === 0 ? <div className="rounded-md border border-dashed border-white/10 p-4 text-center text-sm text-muted-foreground">No chains returned. Run npm run chain:seed after migrations.</div> : null}
        </CardContent>
      </Card>

      <div className="mt-4 rounded-2xl border border-sky-400/20 bg-sky-950/20 p-4 text-sm leading-6 text-sky-100">
        {(data?.policy.notes ?? []).map((note) => <div key={note}>• {note}</div>)}
      </div>
    </AppShell>
  );
}

function ChainRow({ chain }: { chain: ChainRegistryItem }) {
  const explorer = chain.explorers?.[0];
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-white">{chain.name}</span>
            <Badge>{chain.chainType}</Badge>
            <Badge variant="neutral">{chain.environment}</Badge>
            {chain.networkId ? <Badge variant="neutral">eip155:{chain.networkId}</Badge> : null}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{chain.slug} / {chain.nativeSymbol ?? "native unknown"}</div>
          {explorer ? (
            <a className="mt-2 inline-flex items-center gap-1 text-xs text-sky-200" href={explorer.baseUrl} target="_blank" rel="noreferrer">
              {explorer.name} <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(chain.features ?? []).slice(0, 6).map((feature) => (
            <span key={feature.id} className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-slate-200">
              {feature.featureKey}: {feature.status}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, title, value, detail }: { icon: typeof Network; title: string; value: string; detail: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="rounded-2xl bg-white/10 p-3"><Icon className="h-5 w-5 text-sky-200" /></div>
        <div>
          <div className="text-2xl font-semibold text-white">{value}</div>
          <div className="text-sm text-white">{title}</div>
          <div className="text-xs text-muted-foreground">{detail}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function hasFeature(chain: ChainRegistryItem, featureKey: string, status: string) {
  return Boolean(chain.features?.some((feature) => feature.featureKey === featureKey && feature.status === status));
}


function ExplorerContractTool() {
  const { config } = useWorkspaceConfig();
  const [chainId, setChainId] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [result, setResult] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function run(action: "fetch" | "scan") {
    if (!hasWorkspaceConfig(config)) {
      setResult("Workspace config is missing.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const client = new AuditScannerApiClient(config);
      const response = action === "fetch"
        ? await client.fetchContractSourceFromExplorer(chainId, address)
        : await client.scanVerifiedContractFromExplorer(chainId, address);
      setResult(JSON.stringify(response, null, 2));
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Explorer action failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader><CardTitle>P14B explorer verified-source bridge</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Fetch verified explorer source/ABI into a private source artifact, then queue the existing SOURCE scan pipeline. No source or ABI is fabricated.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="Chain UUID from registry" value={chainId} onChange={(event) => setChainId(event.target.value)} />
          <input className="rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="0x contract address" value={address} onChange={(event) => setAddress(event.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={loading || !chainId || !address} onClick={() => run("fetch")} className="rounded-md bg-sky-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Fetch verified source</button>
          <button disabled={loading || !chainId || !address} onClick={() => run("scan")} className="rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Fetch + queue scan</button>
        </div>
        {result ? <pre className="max-h-72 overflow-auto rounded-md border border-white/10 bg-black/40 p-3 text-xs text-slate-100">{result}</pre> : null}
      </CardContent>
    </Card>
  );
}
