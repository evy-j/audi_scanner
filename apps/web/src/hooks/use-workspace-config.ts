"use client";

import * as React from "react";
import {
  defaultApiBaseUrl,
  defaultRealtimeWsUrl,
  type WorkspaceConfig
} from "@/lib/api-client";

const storageKey = "audit-scanner.workspace";

export function useWorkspaceConfig() {
  const [config, setConfig] = React.useState<WorkspaceConfig>({
    apiBaseUrl: defaultApiBaseUrl,
    realtimeWsUrl: defaultRealtimeWsUrl,
    accessToken: "",
    organizationId: ""
  });
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        setConfig({ ...config, ...(JSON.parse(saved) as Partial<WorkspaceConfig>) });
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateConfig = React.useCallback((next: Partial<WorkspaceConfig>) => {
    setConfig((current) => {
      const updated = { ...current, ...next };
      window.localStorage.setItem(storageKey, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { config, updateConfig, ready };
}
