"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, RefreshCw, ShieldCheck, UserCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AuditScannerApiClient, hasWorkspaceConfig } from "@/lib/api-client";
import type { Organization } from "@/types/api";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";
import { clearWorkspaceSession, readStoredUser, refreshStorageKey, saveStoredUser } from "@/lib/workspace-session";

export default function ProfilePage() {
  const router = useRouter();
  const { config, updateConfig, ready } = useWorkspaceConfig();
  const [user, setUser] = React.useState(readStoredUser());
  const [organizations, setOrganizations] = React.useState<Organization[]>([]);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const client = React.useMemo(() => (config.accessToken ? new AuditScannerApiClient(config) : null), [config]);

  const refresh = React.useCallback(async () => {
    if (!client) return;
    setError(null);
    setStatus("Refreshing profile from backend...");
    try {
      const [me, orgs] = await Promise.all([client.getMe(), client.listOrganizations()]);
      const nextUser = { id: me.id, email: me.email, displayName: me.displayName ?? null, status: me.status };
      setUser(nextUser);
      saveStoredUser(nextUser);
      setOrganizations(orgs);
      if (!config.organizationId && orgs[0]) updateConfig({ organizationId: orgs[0].id });
      setStatus("Profile synced.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load profile");
      setStatus(null);
    }
  }, [client, config.organizationId, updateConfig]);

  React.useEffect(() => {
    if (ready && client) void refresh();
  }, [ready, client, refresh]);

  const logout = async () => {
    const refreshToken = window.localStorage.getItem(refreshStorageKey) ?? undefined;
    if (client) await client.logout(refreshToken).catch(() => undefined);
    clearWorkspaceSession();
    router.push("/login");
  };

  if (ready && !config.accessToken) {
    return (
      <AppShell>
        <Card>
          <CardContent className="space-y-4 p-6">
            <UserCircle2 className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-semibold text-white">No active profile</h1>
              <p className="mt-1 text-sm text-muted-foreground">Login or signup once. After that your token, profile, and organization workspace are saved in this browser.</p>
            </div>
            <Button asChild><Link href="/login">Open login</Link></Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-primary"><ShieldCheck className="h-4 w-4" />Workspace profile</div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Profile & workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground">Login, organization, API URL, and scanner state are managed here. Scans and reports are stored in your Supabase-backed database by the API.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" />Refresh</Button>
          <Button variant="destructive" onClick={() => void logout()}><LogOut className="h-4 w-4" />Logout</Button>
        </div>
      </div>

      {status ? <div className="mb-4 rounded-md border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{status}</div> : null}
      {error ? <div className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle>User</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-xl font-semibold text-primary">
                {(user?.displayName || user?.email || "U").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="text-lg font-semibold text-white">{user?.displayName || user?.email || "Signed-in user"}</div>
                <div className="text-sm text-muted-foreground">{user?.email || "No email stored"}</div>
                <div className="mt-1 text-xs text-muted-foreground">Status: {user?.status || "unknown"}</div>
              </div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs leading-5 text-muted-foreground">
              Google/GitHub OAuth is shown on login only when backend provider URLs are configured. Email/password login is currently the real working flow.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Workspace</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="API URL"><Input value={config.apiBaseUrl} onChange={(event) => updateConfig({ apiBaseUrl: event.target.value })} /></Field>
            <Field label="Realtime URL"><Input value={config.realtimeWsUrl} onChange={(event) => updateConfig({ realtimeWsUrl: event.target.value })} /></Field>
            <Field label="Organization ID"><Input value={config.organizationId} onChange={(event) => updateConfig({ organizationId: event.target.value })} /></Field>
            <Field label="Access token / API key"><Input type="password" value={config.accessToken} onChange={(event) => updateConfig({ accessToken: event.target.value })} /></Field>
            <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground">
              Current workspace: {hasWorkspaceConfig(config) ? "ready" : "incomplete"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Organizations</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {organizations.map((org) => (
            <button key={org.id} type="button" onClick={() => updateConfig({ organizationId: org.id })} className="flex w-full items-center justify-between rounded-md border border-white/10 bg-white/5 p-3 text-left text-sm hover:bg-white/10">
              <span><span className="font-medium text-white">{org.name}</span><span className="ml-2 text-muted-foreground">{org.slug}</span></span>
              <span className="text-xs text-muted-foreground">{org.id === config.organizationId ? "active" : "select"}</span>
            </button>
          ))}
          {organizations.length === 0 ? <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">No organizations loaded yet. Refresh after login.</div> : null}
        </CardContent>
      </Card>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}
