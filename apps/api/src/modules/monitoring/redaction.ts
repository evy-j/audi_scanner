import { createHash } from "node:crypto";
import { redactSecrets } from "../remediation/redaction.js";

const URL_SECRET_QUERY_KEYS = new Set([
  "api_key",
  "apikey",
  "key",
  "token",
  "secret",
  "auth",
  "access_token"
]);

export function redactRpcUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (URL_SECRET_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, "[REDACTED]");
      }
    }
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length > 1) {
      parsed.pathname = `/${pathParts[0]}/[REDACTED]`;
    }
    return parsed.toString();
  } catch {
    return "[REDACTED_RPC_URL]";
  }
}

export function redactMonitoringText(value: string | null | undefined): string | null {
  if (!value) return null;
  return redactSecrets(value).replace(/MONITORING_RPC_URL\s*=\s*[^\s"'<>]+/giu, "MONITORING_RPC_URL=[REDACTED_RPC_URL]");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
