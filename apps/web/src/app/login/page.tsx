"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Github, LogIn, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AuditScannerApiClient, defaultApiBaseUrl, defaultRealtimeWsUrl } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";
import { bootstrapWorkspaceAfterSession, saveWorkspaceConfig } from "@/lib/workspace-session";

type Mode = "login" | "signup" | "token";

const googleOAuthUrl = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_URL || "";
const githubOAuthUrl = process.env.NEXT_PUBLIC_GITHUB_OAUTH_URL || "";

function trimmedOrEmpty(value: string) {
  return value.trim();
}

function preferredOrgNamePatch(displayName: string): { preferredOrgName?: string } {
  const preferredOrgName = trimmedOrEmpty(displayName);
  return preferredOrgName ? { preferredOrgName } : {};
}

function displayNamePatch(displayName: string): { displayName?: string } {
  const cleanDisplayName = trimmedOrEmpty(displayName);
  return cleanDisplayName ? { displayName: cleanDisplayName } : {};
}

export default function LoginPage() {
  const router = useRouter();
  const { config } = useWorkspaceConfig();
  const [mode, setMode] = React.useState<Mode>("login");
  const [apiBaseUrl, setApiBaseUrl] = React.useState(config.apiBaseUrl || defaultApiBaseUrl);
  const [realtimeWsUrl, setRealtimeWsUrl] = React.useState(config.realtimeWsUrl || defaultRealtimeWsUrl);
  const [organizationId, setOrganizationId] = React.useState(config.organizationId || "");
  const [displayName, setDisplayName] = React.useState("");
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

  const login = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const client = new AuditScannerApiClient({ apiBaseUrl, realtimeWsUrl, organizationId: "", accessToken: "" });
      const session = await client.login({ email, password });
      const boot = await bootstrapWorkspaceAfterSession({
        apiBaseUrl,
        realtimeWsUrl,
        session,
        ...preferredOrgNamePatch(displayName),
      });
      setMessage(`Login successful. Workspace ${boot.organizationCreated ? "created" : "loaded"}. Opening scanner...`);
      window.setTimeout(() => router.push("/scan"), 450);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const signup = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const client = new AuditScannerApiClient({ apiBaseUrl, realtimeWsUrl, organizationId: "", accessToken: "" });
      await client.signup({ email, password, ...displayNamePatch(displayName) });
      const session = await client.login({ email, password });
      const boot = await bootstrapWorkspaceAfterSession({
        apiBaseUrl,
        realtimeWsUrl,
        session,
        ...preferredOrgNamePatch(displayName),
      });
      setMessage(`Account created. Workspace ${boot.organizationCreated ? "created" : "loaded"}. Opening scanner...`);
      window.setTimeout(() => router.push("/scan"), 450);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  const saveManual = () => {
    if (!organizationId || !manualToken) {
      setError("Manual token mode needs both organization ID and access token/API key.");
      return;
    }
    saveWorkspaceConfig({ apiBaseUrl, realtimeWsUrl, organizationId, accessToken: manualToken });
    setMessage("Workspace token saved. Opening scanner...");
    setError(null);
    window.setTimeout(() => router.push("/scan"), 450);
  };

  const oauth = (provider: "google" | "github") => {
    const url = provider === "google" ? googleOAuthUrl : githubOAuthUrl;
    if (!url) {
      setError(`${provider} login is not configured yet. Add NEXT_PUBLIC_${provider.toUpperCase()}_OAUTH_URL after backend OAuth is wired. Email/password login is real now.`);
      return;
    }
    window.location.href = url;
  };

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="mb-6 flex items-center gap-3 text-sm text-slate-300">
          <ShieldCheck className="h-5 w-5 text-sky-300" /> Audit Scanner
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Login, signup, and workspace setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {message ? <div className="rounded-md border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div> : null}
            {error ? <div className="rounded-md border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div> : null}

            <div className="grid gap-2 sm:grid-cols-3">
              <Button type="button" variant={mode === "login" ? "default" : "secondary"} onClick={() => setMode("login")}><LogIn className="h-4 w-4" />Login</Button>
              <Button type="button" variant={mode === "signup" ? "default" : "secondary"} onClick={() => setMode("signup")}><UserPlus className="h-4 w-4" />Signup</Button>
              <Button type="button" variant={mode === "token" ? "default" : "secondary"} onClick={() => setMode("token")}>API key / token</Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="API URL"><Input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} /></Field>
              <Field label="Realtime WS URL"><Input value={realtimeWsUrl} onChange={(event) => setRealtimeWsUrl(event.target.value)} /></Field>
            </div>

            {mode === "signup" ? <Field label="Your name"><Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Neeraj Kumar" /></Field> : null}

            {mode === "login" || mode === "signup" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Email"><Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></Field>
                  <Field label="Password"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
                </div>
                <Button onClick={() => void (mode === "signup" ? signup() : login())} disabled={loading || !email || !password}>
                  <Mail className="h-4 w-4" />{loading ? "Working..." : mode === "signup" ? "Create account + workspace" : "Login + open workspace"}
                </Button>
              </>
            ) : null}

            {mode === "token" ? (
              <div className="space-y-3 rounded-md border border-white/10 bg-white/5 p-4">
                <Field label="Organization ID"><Input value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} placeholder="UUID from organization settings" /></Field>
                <Field label="Access token or API key"><Input type="password" value={manualToken} onChange={(event) => setManualToken(event.target.value)} /></Field>
                <Button variant="secondary" onClick={saveManual}>Save token and open scanner</Button>
              </div>
            ) : null}

            <div className="rounded-lg border border-white/10 bg-white/5 p-4">
              <div className="mb-3 text-sm font-medium text-white">OAuth / social login</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="secondary" onClick={() => oauth("google")}>Google login</Button>
                <Button type="button" variant="secondary" onClick={() => oauth("github")}><Github className="h-4 w-4" />GitHub login</Button>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">
                Social buttons are real-only: they redirect only when OAuth URLs are configured. Until then, email/password stores user, sessions, organizations, scans, and reports in your Supabase Postgres database through the backend.
              </p>
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
