import { z } from "zod";

export const orgParams = z.object({ orgId: z.string().uuid() });
export const repoParams = orgParams.extend({ repoId: z.string().uuid() });

export const connectInstallationBody = z.object({
  installationId: z.union([z.string().regex(/^\d+$/u), z.number().int().positive()]),
  accountLogin: z.string().min(1).max(160),
  accountType: z.string().max(80).optional()
});

export const connectRepositoryBody = z.object({
  projectId: z.string().uuid().optional(),
  installationId: z.union([z.string().regex(/^\d+$/u), z.number().int().positive()]),
  repoFullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  githubRepositoryId: z.union([z.string().regex(/^\d+$/u), z.number().int().positive()]).optional(),
  defaultBranch: z.string().min(1).max(160).optional(),
  visibility: z.enum(["public", "private", "internal"]).optional()
});

export const repositoryScanBody = z.object({
  branch: z.string().min(1).max(160).optional(),
  commitSha: z.string().regex(/^[A-Fa-f0-9]{7,80}$/u).optional(),
  pullRequestNumber: z.number().int().positive().optional(),
  source: z.enum(["GITHUB_APP", "CLI", "CI"]).default("GITHUB_APP")
});

export type RepositoryScanBody = z.infer<typeof repositoryScanBody>;
