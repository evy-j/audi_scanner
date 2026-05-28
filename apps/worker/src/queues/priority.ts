import type { ScanPriority } from "@audit-scanner/shared/queues/scan-jobs";

export function toBullPriority(priority: ScanPriority): number {
  switch (priority) {
    case "CRITICAL":
      return 1;
    case "HIGH":
      return 5;
    case "NORMAL":
      return 10;
    case "LOW":
      return 20;
  }
}
