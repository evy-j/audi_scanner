export function safeMonitoringStatusMessage(status?: string | null): string {
  switch (status) {
    case "DISABLED":
      return "Monitoring Disabled";
    case "RPC_NOT_CONFIGURED":
      return "RPC Not Configured";
    case "NOT_ASSESSED":
      return "Not Assessed";
    case "REORGED":
      return "Reorged";
    case "PROVIDER_ERROR":
    case "FAILED":
      return "Provider Error";
    case "OBSERVED":
    case "CONFIRMED":
    case "ACTIVE":
      return "Active";
    default:
      return "Not Assessed";
  }
}

export function monitoringBadgeVariant(status?: string | null): "red" | "amber" | "blue" | "default" | "neutral" {
  switch (status) {
    case "FAILED":
    case "PROVIDER_ERROR":
    case "ERROR":
      return "red";
    case "DISABLED":
    case "NOT_ASSESSED":
    case "RPC_NOT_CONFIGURED":
    case "REORGED":
      return "amber";
    case "ACTIVE":
    case "OBSERVED":
    case "CONFIRMED":
      return "default";
    default:
      return "neutral";
  }
}
