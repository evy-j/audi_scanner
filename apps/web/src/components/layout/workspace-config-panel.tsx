"use client";

import * as React from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspaceConfig } from "@/hooks/use-workspace-config";

export function WorkspaceConfigPanel() {
  const { config, updateConfig } = useWorkspaceConfig();
  const [open, setOpen] = React.useState(false);

  return (
    <div className="relative">
      <Button variant="secondary" size="icon" onClick={() => setOpen((value) => !value)} aria-label="Workspace configuration">
        <Settings2 className="h-4 w-4" />
      </Button>

      {open ? (
        <Card className="absolute right-0 top-12 z-50 w-[min(92vw,420px)] shadow-panel">
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="API URL">
              <Input value={config.apiBaseUrl} onChange={(event) => updateConfig({ apiBaseUrl: event.target.value })} />
            </Field>
            <Field label="Realtime URL">
              <Input value={config.realtimeWsUrl} onChange={(event) => updateConfig({ realtimeWsUrl: event.target.value })} />
            </Field>
            <Field label="Organization ID">
              <Input value={config.organizationId} onChange={(event) => updateConfig({ organizationId: event.target.value })} />
            </Field>
            <Field label="Access token">
              <Input
                type="password"
                value={config.accessToken}
                onChange={(event) => updateConfig({ accessToken: event.target.value })}
              />
            </Field>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
