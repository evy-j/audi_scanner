export const SCAN_EVENT_CHANNEL_PREFIX = "scan-events";

export type ScanLifecycleStatus =
  | "QUEUED"
  | "PREPARING"
  | "ANALYZING"
  | "NORMALIZING"
  | "SCORING"
  | "REPORTING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELED"
  | "PARTIAL_COMPLETED";

export type ScanEventType =
  | "scan.queued"
  | "scan.preparing"
  | "scan.analyzing"
  | "build.started"
  | "build.completed"
  | "analyzer.started"
  | "analyzer.completed"
  | "analyzer.failed"
  | "findings.normalizing"
  | "risk.scoring"
  | "ai.validation.started"
  | "ai.validation.completed"
  | "report.generating"
  | "scan.completed"
  | "scan.partial"
  | "scan.failed"
  | "scan.canceled";

export interface ScanProgressEvent {
  eventId: string;
  sequence: number;
  type: ScanEventType;
  scanId: string;
  organizationId: string;
  status: ScanLifecycleStatus;
  progress: number;
  message: string;
  jobId?: string | undefined;
  queueName?: string | undefined;
  workerId?: string | undefined;
  traceId?: string | undefined;
  correlationId?: string | undefined;
  data?: Record<string, unknown> | undefined;
  emittedAt: string;
}

export function getScanEventChannel(scanId: string): string {
  return `${SCAN_EVENT_CHANNEL_PREFIX}:${scanId}`;
}
