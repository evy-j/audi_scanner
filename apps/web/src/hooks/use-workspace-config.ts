"use client";

import * as React from "react";
import type { WorkspaceConfig } from "@/lib/api-client";
import { readWorkspaceConfig, saveWorkspaceConfig } from "@/lib/workspace-session";

export function useWorkspaceConfig() {
  const [config, setConfig] = React.useState<WorkspaceConfig>(() => readWorkspaceConfig());
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setConfig(readWorkspaceConfig());
    setReady(true);

    const sync = () => setConfig(readWorkspaceConfig());
    window.addEventListener("storage", sync);
    window.addEventListener("audit-scanner:workspace-updated", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("audit-scanner:workspace-updated", sync as EventListener);
    };
  }, []);

  const updateConfig = React.useCallback((next: Partial<WorkspaceConfig>) => {
    setConfig((current) => {
      const updated = { ...current, ...next };
      saveWorkspaceConfig(updated);
      return updated;
    });
  }, []);

  return { config, updateConfig, ready };
}
