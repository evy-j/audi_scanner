export function loadConfig(env = process.env) {
  return {
    apiUrl: trimSlash(env.WEB3GUARD_API_URL),
    apiKey: env.WEB3GUARD_API_KEY || "",
    orgId: env.WEB3GUARD_ORG_ID || "",
    projectId: env.WEB3GUARD_PROJECT_ID || "",
    sourceArtifactKey: env.WEB3GUARD_SOURCE_ARTIFACT_KEY || ""
  };
}

export function requireBackendConfig(config) {
  const missing = [];
  if (!config.apiUrl) missing.push("WEB3GUARD_API_URL");
  if (!config.apiKey) missing.push("WEB3GUARD_API_KEY");
  if (!config.orgId) missing.push("WEB3GUARD_ORG_ID");
  if (missing.length > 0) {
    const error = new Error(`Missing required configuration: ${missing.join(", ")}`);
    error.code = "CONFIGURATION_ERROR";
    error.missing = missing;
    throw error;
  }
}

export function redact(value) {
  return String(value)
    .replace(/ask_[A-Za-z0-9]+_[A-Za-z0-9_-]+/gu, "[REDACTED_API_KEY]")
    .replace(/gh[opsru]_[A-Za-z0-9_]+/gu, "[REDACTED_GITHUB_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/giu, "Bearer [REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, "[REDACTED_PRIVATE_KEY]")
    .replace(/(?:seed|mnemonic)\s*(?:phrase)?\s*[:=]\s*["']?(?:[a-z]{3,12}\s+){11,23}[a-z]{3,12}/giu, "mnemonic=[REDACTED_SEED_PHRASE]");
}

function trimSlash(value) {
  return value ? value.replace(/\/+$/u, "") : "";
}
