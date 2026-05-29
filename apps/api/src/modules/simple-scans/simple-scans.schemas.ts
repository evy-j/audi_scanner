import { z } from "zod";

const analyzer = z.enum(["slither", "mythril", "semgrep", "aderyn", "foundry"]);
const priority = z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL");

const uploadFile = z.object({
  path: z.string().min(1).max(1_024),
  contentBase64: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/iu).optional()
});

export const simpleSourceUploadScanBody = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  title: z.string().min(1).max(180),
  priority,
  analyzers: z.array(analyzer).min(1).default(["semgrep"]),
  files: z.array(uploadFile).min(1).max(5_000),
  repoFullName: z.string().min(3).max(320).optional(),
  branch: z.string().min(1).max(160).optional(),
  commitSha: z.string().min(7).max(80).optional(),
  sourceLabel: z.string().min(1).max(160).optional()
});

export const simplePublicRepositoryScanBody = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  title: z.string().min(1).max(180).optional(),
  priority,
  repositoryUrl: z.string().url(),
  branch: z.string().min(1).max(160).optional(),
  analyzers: z.array(analyzer).min(1).default(["semgrep"]),
  maxFiles: z.coerce.number().int().positive().max(500).default(250),
  maxTotalBytes: z.coerce.number().int().positive().max(20 * 1024 * 1024).default(8 * 1024 * 1024)
});

export const passiveWebsiteScanBody = z.object({
  organizationId: z.string().uuid(),
  url: z.string().url()
});

export type SimpleSourceUploadScanInput = z.infer<typeof simpleSourceUploadScanBody>;
export type SimplePublicRepositoryScanInput = z.infer<typeof simplePublicRepositoryScanBody>;
export type PassiveWebsiteScanInput = z.infer<typeof passiveWebsiteScanBody>;
