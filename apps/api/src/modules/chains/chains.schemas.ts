import { z } from "zod";

export const listChainsQuery = z.object({
  environment: z.enum(["MAINNET", "TESTNET", "DEVNET", "LOCAL"]).optional(),
  chainType: z.enum(["EVM", "SOLANA", "COSMOS", "SUBSTRATE", "OTHER"]).optional(),
  status: z.enum(["ACTIVE", "DISABLED", "DEPRECATED"]).optional(),
  feature: z.string().trim().min(1).max(80).optional()
});

export const chainParams = z.object({
  chainId: z.string().uuid()
});

export const orgChainParams = z.object({
  orgId: z.string().uuid(),
  chainId: z.string().uuid()
});

export const orgChainQuery = z.object({
  projectId: z.string().uuid().optional()
});

export const validateAddressQuery = z.object({
  address: z.string().trim().min(1).max(128)
});

export const createRpcEndpointBody = z.object({
  projectId: z.string().uuid().optional(),
  providerName: z.string().trim().min(1).max(120),
  endpointEnvKey: z.string().trim().min(3).max(160).regex(/^[A-Z0-9_]+$/),
  redactedHost: z.string().trim().min(1).max(180).optional(),
  priority: z.number().int().min(0).max(10_000).optional(),
  status: z.enum(["ACTIVE", "DISABLED", "ERROR", "NOT_CONFIGURED"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
