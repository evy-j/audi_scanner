import { z } from "zod";

export const apiKeyParams = z.object({
  organizationId: z.string().uuid()
});

export const apiKeyIdParams = apiKeyParams.extend({
  apiKeyId: z.string().uuid()
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(160),
  scopes: z.array(z.string().min(1).max(120)).max(100).default([]),
  projectId: z.string().uuid().optional(),
  githubRepositoryId: z.string().uuid().optional(),
  expiresAt: z.string().datetime().optional()
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
