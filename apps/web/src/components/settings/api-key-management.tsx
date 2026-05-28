"use client";

import * as React from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AuditScannerApiClient, hasWorkspaceConfig } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";
import { formatDateTime } from "@/lib/utils";
import type { ApiKeyRecord, CreatedApiKey } from "@/types/api";

const defaultScopes = ["scans:read", "scans:create", "reports:read", "reports:export", "vulnerabilities:read"];

export function ApiKeyManagement() {
  const { config } = useWorkspaceConfig();
  const [keys, setKeys] = React.useState<ApiKeyRecord[]>([]);
  const [name, setName] = React.useState("CI scanner");
  const [createdKey, setCreatedKey] = React.useState<CreatedApiKey | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!hasWorkspaceConfig(config)) {
      return;
    }
    const client = new AuditScannerApiClient(config);
    setKeys(await client.listApiKeys());
  }, [config]);

  React.useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load API keys"));
  }, [load]);

  const create = async () => {
    if (!hasWorkspaceConfig(config)) {
      setMessage("Workspace configuration is incomplete");
      return;
    }
    setMessage(null);
    try {
      const client = new AuditScannerApiClient(config);
      const key = await client.createApiKey({ name, scopes: defaultScopes });
      setCreatedKey(key);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create API key");
    }
  };

  const revoke = async (apiKeyId: string) => {
    if (!hasWorkspaceConfig(config)) {
      return;
    }
    try {
      const client = new AuditScannerApiClient(config);
      await client.revokeApiKey(apiKeyId);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to revoke API key");
    }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Badge variant="blue" className="mb-3">Access control</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-white">API key management</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Issue scoped keys for automation, CI scans, and report export workflows.
        </p>
      </div>

      {message ? <div className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{message}</div> : null}
      {createdKey ? (
        <div className="mb-4 rounded-md border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100">
          <div className="font-medium">New key</div>
          <div className="mt-1 break-all font-mono text-xs">{createdKey.apiKey}</div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              {defaultScopes.map((scope) => (
                <Badge key={scope} variant="neutral">{scope}</Badge>
              ))}
            </div>
            <Button onClick={() => void create()}>
              <Plus className="h-4 w-4" />
              Create key
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Keys</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {keys.map((key) => (
              <div key={key.id} className="flex flex-col gap-3 rounded-md border border-white/10 bg-white/6 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <KeyRound className="h-4 w-4 text-primary" />
                    {key.name}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {key.keyPrefix} / {key.status} / {formatDateTime(key.createdAt)}
                  </div>
                </div>
                <Button variant="destructive" size="sm" onClick={() => void revoke(key.id)} disabled={key.status !== "ACTIVE"}>
                  <Trash2 className="h-4 w-4" />
                  Revoke
                </Button>
              </div>
            ))}
            {keys.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/10 p-8 text-center text-sm text-muted-foreground">No API keys available</div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
