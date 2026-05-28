import { z } from "zod";

export const sourceArtifactParams = z.object({
  artifactId: z.string().uuid()
});

export const sourceIngestionRunParams = z.object({
  runId: z.string().uuid()
});

export const repositoryParams = z.object({
  repositoryId: z.string().uuid()
});

export const pullRequestParams = z.object({
  pullRequestId: z.string().min(1).max(120)
});

const sourceOriginKind = z.enum([
  "GITHUB_APP_ARCHIVE",
  "GITHUB_APP_CHECKOUT",
  "CLI_UPLOAD",
  "CI_UPLOAD",
  "LOCAL_PATH_REFERENCE",
  "MANUAL_UPLOAD"
]);

const uploadFileSchema = z.object({
  path: z.string().min(1).max(1_024),
  contentBase64: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/iu).optional()
});

export const sourceArtifactUploadBody = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  repositoryId: z.string().uuid().optional(),
  originKind: sourceOriginKind.default("CLI_UPLOAD"),
  provider: z.enum(["GITHUB"]).optional(),
  repoOwner: z.string().min(1).max(160).optional(),
  repoName: z.string().min(1).max(160).optional(),
  repoFullName: z.string().min(3).max(320).optional(),
  branch: z.string().min(1).max(160).optional(),
  commitSha: z.string().min(7).max(80).optional(),
  pullRequestNumber: z.coerce.number().int().positive().optional(),
  pathHash: z.string().max(128).optional(),
  dryRun: z.coerce.boolean().default(false),
  maxFileBytes: z.coerce.number().int().positive().max(10 * 1024 * 1024).optional(),
  maxTotalBytes: z.coerce.number().int().positive().max(100 * 1024 * 1024).optional(),
  include: z.array(z.string().min(1).max(300)).max(100).optional(),
  exclude: z.array(z.string().min(1).max(300)).max(200).optional(),
  files: z.array(uploadFileSchema).min(1).max(5_000)
});

export const repositoryIngestBody = z.object({
  organizationId: z.string().uuid().optional(),
  branch: z.string().min(1).max(160).optional(),
  commitSha: z.string().min(7).max(80).optional(),
  pullRequestNumber: z.coerce.number().int().positive().optional(),
  maxFileBytes: z.coerce.number().int().positive().max(10 * 1024 * 1024).optional(),
  maxTotalBytes: z.coerce.number().int().positive().max(100 * 1024 * 1024).optional(),
  include: z.array(z.string().min(1).max(300)).max(100).optional(),
  exclude: z.array(z.string().min(1).max(300)).max(200).optional()
});

export const repositoryScanBody = repositoryIngestBody.extend({
  title: z.string().min(1).max(180).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  source: z.enum(["GITHUB_APP", "CLI", "CI"]).default("GITHUB_APP"),
  analyzers: z.array(z.enum(["slither", "mythril", "semgrep", "aderyn", "foundry"])).min(1).default(["slither", "mythril", "semgrep"])
});

export const pullRequestScanBody = z.object({
  organizationId: z.string().uuid(),
  repositoryId: z.string().uuid().optional(),
  repoFullName: z.string().min(3).max(320).optional(),
  branch: z.string().min(1).max(160).optional(),
  commitSha: z.string().min(7).max(80).optional(),
  pullRequestNumber: z.coerce.number().int().positive().optional(),
  source: z.enum(["GITHUB_APP", "CLI", "CI"]).default("GITHUB_APP")
});

export type SourceArtifactUploadInput = z.infer<typeof sourceArtifactUploadBody>;
export type RepositoryIngestInput = z.infer<typeof repositoryIngestBody>;
export type RepositoryScanInput = z.infer<typeof repositoryScanBody>;
export type PullRequestScanInput = z.infer<typeof pullRequestScanBody>;
