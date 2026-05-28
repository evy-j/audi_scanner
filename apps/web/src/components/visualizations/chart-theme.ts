import type { Scan, Severity, Vulnerability } from "@/types/api";
import { toNumber } from "@/lib/utils";

export const severityPalette: Record<Severity, string> = {
  CRITICAL: "#fb7185",
  HIGH: "#f97316",
  MEDIUM: "#facc15",
  LOW: "#38bdf8",
  INFORMATIONAL: "#34d399"
};

export const severityWeights: Record<Severity, number> = {
  CRITICAL: 10,
  HIGH: 8,
  MEDIUM: 5,
  LOW: 2,
  INFORMATIONAL: 1
};

export const statusPalette: Record<string, string> = {
  DRAFT: "#94a3b8",
  QUEUED: "#38bdf8",
  PREPARING: "#60a5fa",
  RUNNING: "#22d3ee",
  ANALYZING: "#a78bfa",
  NORMALIZING: "#818cf8",
  SCORING: "#facc15",
  REPORTING: "#34d399",
  COMPLETED: "#10b981",
  FAILED: "#fb7185",
  CANCELED: "#94a3b8",
  EXPIRED: "#f97316"
};

export type SeverityCounts = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
};

export function createSeverityCounts(vulnerabilities: Vulnerability[]): SeverityCounts {
  return vulnerabilities.reduce(
    (counts, vulnerability) => {
      counts[severityKey(vulnerability.severity)] += 1;
      return counts;
    },
    { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
  );
}

export function severityKey(severity: Severity): keyof SeverityCounts {
  switch (severity) {
    case "CRITICAL":
      return "critical";
    case "HIGH":
      return "high";
    case "MEDIUM":
      return "medium";
    case "LOW":
      return "low";
    case "INFORMATIONAL":
      return "informational";
  }
}

export function severityLabel(key: keyof SeverityCounts) {
  return key === "informational" ? "Info" : key.charAt(0).toUpperCase() + key.slice(1);
}

export function createRiskTrend(scans: Scan[]) {
  return [...scans]
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .slice(-18)
    .map((scan) => ({
      id: scan.id,
      label: formatShortDate(scan.createdAt),
      risk: Math.round(toNumber(scan.riskScore)),
      progress: Math.round(Number(scan.progress) || 0),
      status: scan.status
    }));
}

export function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatShortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

