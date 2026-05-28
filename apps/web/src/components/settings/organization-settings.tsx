"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AuditScannerApiClient, hasWorkspaceConfig } from "@/lib/api-client";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";
import type { Organization } from "@/types/api";

export function OrganizationSettings() {
  const { config } = useWorkspaceConfig();
  const [organization, setOrganization] = React.useState<Organization | null>(null);
  const [name, setName] = React.useState("");
  const [billingEmail, setBillingEmail] = React.useState("");
  const [status, setStatus] = React.useState("ACTIVE");
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!hasWorkspaceConfig(config)) {
      return;
    }

    const load = async () => {
      const client = new AuditScannerApiClient(config);
      const org = await client.getOrganization();
      setOrganization(org);
      setName(org.name);
      setBillingEmail(org.billingEmail ?? "");
      setStatus(org.status);
    };

    void load().catch((error) => setMessage(error instanceof Error ? error.message : "Unable to load organization"));
  }, [config]);

  const save = async () => {
    if (!hasWorkspaceConfig(config)) {
      setMessage("Workspace configuration is incomplete");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const client = new AuditScannerApiClient(config);
      const updated = await client.updateOrganization({
        name,
        ...(billingEmail ? { billingEmail } : {}),
        status
      });
      setOrganization(updated);
      setMessage("Organization updated");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save organization");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="mb-6">
        <Badge variant="blue" className="mb-3">Organization</Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Organization settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Operational profile and billing contact for the active audit workspace.
        </p>
      </div>

      {message ? <div className="mb-4 rounded-md border border-white/10 bg-white/8 p-3 text-sm text-slate-200">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Billing email">
              <Input value={billingEmail} onChange={(event) => setBillingEmail(event.target.value)} />
            </Field>
            <Field label="Status">
              <div className="flex gap-2">
                {["ACTIVE", "SUSPENDED"].map((value) => (
                  <Button key={value} variant={status === value ? "default" : "secondary"} onClick={() => setStatus(value)}>
                    {value}
                  </Button>
                ))}
              </div>
            </Field>
            <Button onClick={() => void save()} disabled={saving}>
              <Save className="h-4 w-4" />
              Save changes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-md border border-white/10 bg-white/6 p-3">
              <div className="text-xs">Organization ID</div>
              <div className="mt-1 break-all text-white">{organization?.id ?? (config.organizationId || "Not set")}</div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/6 p-3">
              <div className="text-xs">Slug</div>
              <div className="mt-1 text-white">{organization?.slug ?? "Not available"}</div>
            </div>
          </CardContent>
        </Card>
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
