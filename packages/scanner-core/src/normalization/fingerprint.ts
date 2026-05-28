import { createHash } from "node:crypto";
import type { NormalizedFinding, SourceLocation, VulnerabilityCategory } from "./types.js";
import { normalizeText } from "./utils.js";

export function createStableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createFindingFingerprint(input: {
  analyzer: string;
  ruleId: string;
  category: VulnerabilityCategory;
  location: SourceLocation;
  title: string;
}): string {
  return createStableHash(
    [
      input.analyzer,
      input.ruleId,
      input.category,
      input.location.filePath ?? "",
      input.location.contractName ?? "",
      input.location.functionName ?? "",
      input.location.lineStart ?? "",
      normalizeText(input.title)
    ].join("|")
  );
}

export function createDedupeKey(input: {
  category: VulnerabilityCategory;
  location: SourceLocation;
  ruleId?: string | undefined;
  title: string;
}): string {
  const line = typeof input.location.lineStart === "number" ? input.location.lineStart.toString() : "";

  const locationKey = [
    input.location.filePath ?? "",
    input.ruleId ?? "",
    input.location.contractName ?? "",
    input.location.functionName ?? "",
    line
  ]
    .filter(Boolean)
    .join(":");

  return [
    input.category,
    locationKey || normalizeText(input.title).slice(0, 120)
  ].join("|");
}

export function createAggregateFingerprint(findings: NormalizedFinding[]): string {
  const ordered = findings
    .map((finding) => finding.fingerprint)
    .sort()
    .join("|");

  return createStableHash(ordered);
}
