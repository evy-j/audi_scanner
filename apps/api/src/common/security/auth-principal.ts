export interface UserPrincipal {
  type: "user";
  userId: string;
  sessionId: string;
  organizationId?: string | undefined;
  permissions: string[];
  scopes: string[];
}

export interface ApiKeyPrincipal {
  type: "apiKey";
  apiKeyId: string;
  organizationId: string;
  projectId?: string | undefined;
  githubRepositoryId?: string | undefined;
  userId?: string | undefined;
  permissions: string[];
  scopes: string[];
}

export type AuthPrincipal = UserPrincipal | ApiKeyPrincipal;
