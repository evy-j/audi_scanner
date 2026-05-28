import { z } from "zod";
import { paginationQuery } from "../../common/validation/common-schemas.js";

const scanTargetSchema = z
  .object({
    type: z.enum(["ADDRESS", "SOURCE", "REPOSITORY", "BYTECODE"]),
    chainId: z.string().uuid().optional(),
    address: z.string().min(20).max(128).optional(),
    repositoryUrl: z.string().url().optional(),
    artifactKey: z.string().min(1).max(512).optional()
  })
  .superRefine((target, context) => {
    if (target.type === "ADDRESS" && !target.address) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["address"],
        message: "address is required for ADDRESS scans"
      });
    }

    if (target.type === "REPOSITORY" && !target.repositoryUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repositoryUrl"],
        message: "repositoryUrl is required for REPOSITORY scans"
      });
    }

    if (target.type === "BYTECODE" && !target.artifactKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["artifactKey"],
        message: "artifactKey is required for BYTECODE scans"
      });
    }
  });

export const createScanSchema = z
  .object({
    organizationId: z.string().uuid(),
    projectId: z.string().uuid().optional(),
    chainId: z.string().uuid().optional(),
    contractId: z.string().uuid().optional(),
    sourceArtifactId: z.string().uuid().optional(),
    contractAddress: z.string().min(20).max(128).optional(),
    explorerSourceEnabled: z.boolean().default(false).optional(),
    title: z.string().min(1).max(180).optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
    target: scanTargetSchema,
    analyzers: z
      .array(z.enum(["slither", "mythril", "semgrep", "aderyn", "foundry"]))
      .min(1)
      .default(["slither", "mythril", "semgrep"])
  })
  .superRefine((scan, context) => {
    if (scan.target.type === "ADDRESS" && !scan.chainId && !scan.target.chainId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chainId"],
        message: "chainId is required for ADDRESS scans"
      });
    }
    if (scan.target.type === "SOURCE" && !scan.target.artifactKey && !scan.sourceArtifactId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceArtifactId"],
        message: "sourceArtifactId or target.artifactKey is required for SOURCE scans"
      });
    }
  });

export const listScansQuery = paginationQuery.extend({
  organizationId: z.string().uuid(),
  status: z
    .enum([
      "QUEUED",
      "PREPARING",
      "RUNNING",
      "ANALYZING",
      "NORMALIZING",
      "SCORING",
      "REPORTING",
      "COMPLETED",
      "PARTIAL",
      "FAILED",
      "CANCELED"
    ])
    .optional()
});

export const scanParams = z.object({
  scanId: z.string().uuid()
});

export type CreateScanInput = z.infer<typeof createScanSchema>;
export type ListScansQuery = z.infer<typeof listScansQuery>;
