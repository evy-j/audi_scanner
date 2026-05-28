import { z } from "zod";

export const chainAddressParams = z.object({
  chainId: z.string().uuid(),
  address: z.string().min(20).max(128)
});

export const verificationQuery = z.object({
  organizationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional()
});

export const fetchExplorerSourceBody = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  includeAbi: z.boolean().default(true),
  createSourceArtifact: z.boolean().default(true),
  maxFileBytes: z.number().int().positive().optional(),
  maxTotalBytes: z.number().int().positive().optional()
});

export const scanExplorerSourceBody = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  title: z.string().min(1).max(180).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  analyzers: z.array(z.enum(["slither", "mythril", "semgrep", "aderyn", "foundry"])).min(1).default(["slither", "mythril", "semgrep"]),
  fetchIfMissing: z.boolean().default(true)
});

export type FetchExplorerSourceBody = z.infer<typeof fetchExplorerSourceBody>;
export type ScanExplorerSourceBody = z.infer<typeof scanExplorerSourceBody>;
