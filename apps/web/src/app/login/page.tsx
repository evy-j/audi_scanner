"use client";

import * as React from "react";
import Link from "next/link";
import { LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AuditScannerApiClient, defaultApiBaseUrl, defaultRealtimeWsUrl } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";

const refreshKey = "audit-scanner.refresh-token";

export default function LoginPage() {
  const { config, updateConfig } = useWorkspaceConfig();
  const [apiBaseUrl, setApiBaseUrl] = React.useState(config.apiBaseUrl || defaultApiBaseUrl);
  const [realtimeWsUrl, setRealtimeWsUrl] = React.useState(config.realtimeWsUrl || defaultRealtimeWsUrl);
  const [organizationId, setOrganizationId] = React.useState(config.organizationId || "");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [manualToken, setManualToken] = React.useState(config.accessToken || "");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setApiBaseUrl(config.apiBaseUrl || defaultApiBaseUrl);
    setRealtimeWsUrl(config.realtimeWsUrl || defaultRealtimeWsUrl);
    setOrganizationId(config.organizationId || "");
    setManualToken(config.accessToken || "");
  }, [config.apiBaseUrl, config.realtimeWsUrl, config.organizationId, config.accessToken]);

  const saveManual = () => {
    updateConfig({ apiBaseUrl, realtimeWsUrl, organizationId, accessToken: manualToken });
    setMessage("Workspace token saved. Open Scan page now.");
    setError(null);
  };

  const login = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const client = new AuditScannerApiClient({ apiBaseUrl, realtimeWsUrl, organizationId, accessToken: "" });
      const session = await client.login({ email, password });
      updateConfig({ apiBaseUrl, realtimeWsUrl, organizationId, accessToken: session.accessToken });
      window.localStorage.setItem(refreshKey, session.refreshToken);
      setManualToken(session.accessToken);
      setMessage("Login successful. Token saved in this browser. Open Scan page.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-6 flex items-center gap-3 text-sm text-slate-300">
          <ShieldCheck className="h-5 w-5 text-sky-300" /> Audit Scanner
        </Link>
        <Card>
          <CardHeader><CardTitle>Login / connect workspace</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {message ? <div className="rounded-md border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}
            {error ? <div className="rounded-md border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}
            <Field label="API URL"><Input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} /></Field>
            <Field label="Realtime WS URL"><Input value={realtimeWsUrl} onChange={(event) => setRealtimeWsUrl(event.target.value)} /></Field>
            <Field label="Organization ID"><Input value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} placeholder="UUID from your org/settings" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Email"><Input value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
              <Field label="Password"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
            </div>
            <Button onClick={() => void login()} disabled={loading || !email || !password}><LogIn className="h-4 w-4" />Login with API</Button>
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <div className="mb-2 text-sm font-medium text-white">Or paste existing access token / API key</div>
              <Field label="Access token or API key"><Input type="password" value={manualToken} onChange={(event) => setManualToken(event.target.value)} /></Field>
              <Button className="mt-3" variant="secondary" onClick={saveManual}>Save token</Button>
            </div>
            <div className="text-xs leading-5 text-slate-400">
              Note: signup creates a pending account until your production activation/email flow is configured. For now, use an existing active user token/API key or bootstrap admin account.
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-medium text-slate-400">{label}</span>{children}</label>;
}
