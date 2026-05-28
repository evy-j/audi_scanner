import { z } from "zod";
import type { ScanProgressEvent } from "@audit-scanner/shared/queues/scan-events";

export const realtimeClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("scan.subscribe"),
    requestId: z.string().min(1).max(128).optional(),
    scanId: z.string().uuid(),
    lastEventSequence: z.coerce.number().int().min(0).optional()
  }),
  z.object({
    type: z.literal("scan.unsubscribe"),
    requestId: z.string().min(1).max(128).optional(),
    scanId: z.string().uuid()
  }),
  z.object({
    type: z.literal("ping"),
    requestId: z.string().min(1).max(128).optional(),
    nonce: z.string().min(1).max(128).optional()
  })
]);

export type RealtimeClientMessage =
  | {
      type: "scan.subscribe";
      requestId?: string | undefined;
      scanId: string;
      lastEventSequence?: number | undefined;
    }
  | {
      type: "scan.unsubscribe";
      requestId?: string | undefined;
      scanId: string;
    }
  | {
      type: "ping";
      requestId?: string | undefined;
      nonce?: string | undefined;
    };

export interface ScanRealtimeState {
  scanId: string;
  organizationId: string;
  status: string;
  progress: number;
  message: string;
  sequence: number;
  eventId?: string | undefined;
  updatedAt?: string | undefined;
  workerId?: string | undefined;
  queueName?: string | undefined;
}

export type RealtimeServerMessage =
  | {
      type: "connection.ready";
      connectionId: string;
      heartbeatIntervalMs: number;
      maxSubscriptions: number;
      serverTime: string;
    }
  | {
      type: "subscription.confirmed";
      requestId?: string | undefined;
      scanId: string;
      organizationId: string;
      lastEventSequence: number;
      replayedEvents: number;
    }
  | {
      type: "subscription.closed";
      requestId?: string | undefined;
      scanId: string;
    }
  | {
      type: "scan.snapshot";
      scanId: string;
      state: ScanRealtimeState | null;
    }
  | {
      type: "scan.event";
      event: ScanProgressEvent;
    }
  | {
      type: "pong";
      requestId?: string | undefined;
      nonce?: string | undefined;
      serverTime: string;
    }
  | {
      type: "error";
      requestId?: string | undefined;
      code: string;
      message: string;
      details?: unknown;
    };
