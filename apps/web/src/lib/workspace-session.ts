import {
  AuditScannerApiClient,
  defaultApiBaseUrl,
  defaultRealtimeWsUrl,
  normalizeWorkspaceConfig,
  type AuthSession,
  type WorkspaceConfig
} from "@/lib/api-client";

export const workspaceStorageKey = "audit-scanner.workspace";
export const refreshStorageKey = "audit-scanner.refresh-token";
export const userStorageKey = "audit-scanner.user";

export type StoredUserProfile = {
  id: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  status?: string;
};

export type WorkspaceBootstrapResult = {
  config: WorkspaceConfig;
  user: StoredUserProfile | null;
  organizationCreated: boolean;
};

export function readWorkspaceConfig(): WorkspaceConfig {
  const fallback: WorkspaceConfig = {
    apiBaseUrl: defaultApiBaseUrl,
    realtimeWsUrl: defaultRealtimeWsUrl,
    accessToken: "",
    organizationId: ""
  };

  const normalizedFallback = normalizeWorkspaceConfig(fallback);
  if (typeof window === "undefined") return normalizedFallback;
  const saved = window.localStorage.getItem(workspaceStorageKey);
  if (!saved) return normalizedFallback;

  try {
    const parsed = JSON.parse(saved) as Partial<WorkspaceConfig>;
    const normalized = normalizeWorkspaceConfig({ ...normalizedFallback, ...parsed });
    if (normalized.apiBaseUrl !== parsed.apiBaseUrl) {
      window.localStorage.setItem(workspaceStorageKey, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    window.localStorage.removeItem(workspaceStorageKey);
    return normalizedFallback;
  }
}

export function saveWorkspaceConfig(config: WorkspaceConfig) {
  if (typeof window === "undefined") return;
  const normalized = normalizeWorkspaceConfig(config);
  window.localStorage.setItem(workspaceStorageKey, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent("audit-scanner:workspace-updated", { detail: normalized }));
}

export function readStoredUser(): StoredUserProfile | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(userStorageKey);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as StoredUserProfile;
  } catch {
    window.localStorage.removeItem(userStorageKey);
    return null;
  }
}

export function saveStoredUser(user: StoredUserProfile | null) {
  if (typeof window === "undefined") return;
  if (user) window.localStorage.setItem(userStorageKey, JSON.stringify(user));
  else window.localStorage.removeItem(userStorageKey);
  window.dispatchEvent(new CustomEvent("audit-scanner:user-updated", { detail: user }));
}

export function clearWorkspaceSession() {
  if (typeof window === "undefined") return;
  const current = readWorkspaceConfig();
  saveWorkspaceConfig({ ...current, accessToken: "", organizationId: "" });
  window.localStorage.removeItem(refreshStorageKey);
  saveStoredUser(null);
}

export async function bootstrapWorkspaceAfterSession(input: {
  apiBaseUrl: string;
  realtimeWsUrl: string;
  session: AuthSession;
  preferredOrgName?: string;
}): Promise<WorkspaceBootstrapResult> {
  const baseConfig: WorkspaceConfig = {
    apiBaseUrl: input.apiBaseUrl,
    realtimeWsUrl: input.realtimeWsUrl,
    accessToken: input.session.accessToken,
    organizationId: ""
  };
  const client = new AuditScannerApiClient(baseConfig);
  const [me, organizations] = await Promise.all([
    client.getMe().catch(() => input.session.user ?? null),
    client.listOrganizations().catch(() => [])
  ]);

  let organizationCreated = false;
  let organization = organizations[0];
  if (!organization) {
    organizationCreated = true;
    organization = await client.createOrganization({
      name: input.preferredOrgName || `${displayNameFromUser(me) || "My"} Workspace`,
      slug: stableSlug(input.preferredOrgName || displayNameFromUser(me) || "my-workspace")
    });
  }

  const config = { ...baseConfig, organizationId: organization.id };
  const user = normalizeUser(me);
  saveWorkspaceConfig(config);
  saveStoredUser(user);
  if (input.session.refreshToken) window.localStorage.setItem(refreshStorageKey, input.session.refreshToken);
  return { config, user, organizationCreated };
}

function normalizeUser(value: unknown): StoredUserProfile | null {
  if (!value || typeof value !== "object") return null;
  const user = value as { id?: unknown; email?: unknown; displayName?: unknown; avatarUrl?: unknown; status?: unknown };
  if (typeof user.id !== "string") return null;

  const normalized: StoredUserProfile = {
    id: user.id,
    email: typeof user.email === "string" ? user.email : null,
    displayName: typeof user.displayName === "string" ? user.displayName : null,
    avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : null
  };

  if (typeof user.status === "string") {
    normalized.status = user.status;
  }

  return normalized;
}

function displayNameFromUser(value: unknown): string | null {
  const user = normalizeUser(value);
  return user?.displayName || user?.email?.split("@")[0] || null;
}

function stableSlug(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  return `${slug || "workspace"}-${Math.random().toString(36).slice(2, 8)}`;
}
