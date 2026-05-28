"use client";

import * as React from "react";
import type { WorkspaceConfig } from "@/lib/api-client";
import type { ScanProgressEvent } from "@/types/api";

export function useLiveScanProgress(config: WorkspaceConfig, scanId?: string | null) {
  const [events, setEvents] = React.useState<ScanProgressEvent[]>([]);
  const [status, setStatus] = React.useState<"idle" | "connecting" | "open" | "closed" | "error">("idle");
  const lastSequenceRef = React.useRef(0);

  React.useEffect(() => {
    lastSequenceRef.current = 0;
    setEvents([]);
  }, [scanId]);

  React.useEffect(() => {
    if (!scanId || !config.realtimeWsUrl || !config.accessToken) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let stopped = false;
    let attempts = 0;

    const connect = () => {
      setStatus("connecting");
      let url: URL;
      try {
        url = new URL(config.realtimeWsUrl);
      } catch {
        setStatus("error");
        return;
      }
      url.searchParams.set("access_token", config.accessToken);
      socket = new WebSocket(url.toString());

      socket.addEventListener("open", () => {
        attempts = 0;
        setStatus("open");
        socket?.send(
          JSON.stringify({
            type: "scan.subscribe",
            scanId,
            lastEventSequence: lastSequenceRef.current
          })
        );
      });

      socket.addEventListener("message", (message) => {
        let payload: { type?: string; event?: ScanProgressEvent };
        try {
          payload = JSON.parse(String(message.data)) as { type?: string; event?: ScanProgressEvent };
        } catch {
          return;
        }

        if (payload.type === "scan.event" && payload.event) {
          const scanEvent = payload.event;
          setEvents((current) => {
            const exists = current.some((event) => event.eventId === scanEvent.eventId);
            return exists ? current : [...current, scanEvent].slice(-200);
          });
          lastSequenceRef.current = scanEvent.sequence;
        }
      });

      socket.addEventListener("close", () => {
        setStatus("closed");
        if (!stopped) {
          attempts += 1;
          const delay = Math.min(12000, 800 * attempts);
          reconnectTimer = window.setTimeout(connect, delay);
        }
      });

      socket.addEventListener("error", () => {
        setStatus("error");
      });
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close(1000, "Component unmounted");
    };
  }, [config.accessToken, config.realtimeWsUrl, scanId]);

  const latest = events.at(-1);

  return {
    events,
    latest,
    status,
    progress: latest?.progress ?? 0,
    scanStatus: latest?.status ?? "QUEUED"
  };
}
