import { env } from "../../config/environment.js";

export interface GitHubAppConfigStatus {
  configured: boolean;
  status: "CONFIGURED" | "NOT_CONFIGURED";
  message: string;
  appName: string | null;
  missing: string[];
  clientConfigured: boolean;
  webhookConfigured: boolean;
}

const requiredKeys = [
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_WEBHOOK_SECRET"
] as const;

export function githubAppConfigStatus(): GitHubAppConfigStatus {
  const missing = requiredKeys.filter((key) => !env[key]);
  return {
    configured: missing.length === 0,
    status: missing.length === 0 ? "CONFIGURED" : "NOT_CONFIGURED",
    message: missing.length === 0 ? "GitHub App configured" : "GitHub App not configured",
    appName: env.GITHUB_APP_NAME ?? null,
    missing,
    clientConfigured: Boolean(env.GITHUB_APP_CLIENT_ID && env.GITHUB_APP_CLIENT_SECRET),
    webhookConfigured: Boolean(env.GITHUB_APP_WEBHOOK_SECRET)
  };
}

export function githubPrivateKey(): string | null {
  if (!env.GITHUB_APP_PRIVATE_KEY) return null;
  return env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/gu, "\n");
}
