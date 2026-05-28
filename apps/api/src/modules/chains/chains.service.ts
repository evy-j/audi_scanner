import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { normalizeAddressForChain } from "@audit-scanner/shared";
import { prisma } from "../../infra/prisma/prisma.js";
import { ApiError } from "../../common/errors/api-error.js";

export class ChainsService {
  async listChains(input: { environment?: string; chainType?: string; status?: string; feature?: string }) {
    const chains = await prisma.chain.findMany({
      where: {
        deletedAt: null,
        ...(input.environment ? { environment: input.environment as any } : {}),
        ...(input.chainType ? { chainType: input.chainType as any } : {}),
        ...(input.status ? { status: input.status as any } : {})
      },
      orderBy: [{ environment: "asc" }, { name: "asc" }]
    });

    const chainIds = chains.map((chain) => chain.id);
    const [features, explorers] = await Promise.all([
      prisma.chainFeatureSupport.findMany({
        where: {
          chainId: { in: chainIds },
          deletedAt: null,
          ...(input.feature ? { featureKey: input.feature } : {})
        }
      }),
      prisma.chainExplorer.findMany({ where: { chainId: { in: chainIds }, deletedAt: null, status: "ACTIVE" } })
    ]);

    const featuresByChain = groupBy(features, (feature) => feature.chainId);
    const explorersByChain = groupBy(explorers, (explorer) => explorer.chainId);

    return {
      chains: chains
        .filter((chain) => !input.feature || (featuresByChain.get(chain.id) ?? []).length > 0)
        .map((chain) => ({
          ...chain,
          features: featuresByChain.get(chain.id) ?? [],
          explorers: explorersByChain.get(chain.id) ?? []
        })),
      policy: this.safetyPolicy()
    };
  }

  async getChain(chainId: string) {
    const chain = await prisma.chain.findFirst({ where: { id: chainId, deletedAt: null } });
    if (!chain) throw ApiError.notFound("Chain");
    const [features, explorers] = await Promise.all([
      prisma.chainFeatureSupport.findMany({ where: { chainId, deletedAt: null }, orderBy: { featureKey: "asc" } }),
      prisma.chainExplorer.findMany({ where: { chainId, deletedAt: null }, orderBy: { name: "asc" } })
    ]);
    return { ...chain, features, explorers, policy: this.safetyPolicy() };
  }

  async listExplorers(chainId: string) {
    await this.requireChain(chainId);
    return { explorers: await prisma.chainExplorer.findMany({ where: { chainId, deletedAt: null }, orderBy: { name: "asc" } }) };
  }

  async listFeatures(chainId: string) {
    await this.requireChain(chainId);
    return { features: await prisma.chainFeatureSupport.findMany({ where: { chainId, deletedAt: null }, orderBy: { featureKey: "asc" } }) };
  }

  async listRpcEndpoints(chainId: string, organizationId?: string, projectId?: string) {
    await this.requireChain(chainId);
    const endpoints = await prisma.chainRpcEndpoint.findMany({
      where: {
        chainId,
        deletedAt: null,
        OR: [
          { organizationId: null, projectId: null },
          ...(organizationId ? [{ organizationId, ...(projectId ? { projectId } : {}) }] : [])
        ]
      },
      orderBy: [{ priority: "asc" }, { providerName: "asc" }]
    });
    return {
      endpoints: endpoints.map((endpoint) => ({
        ...endpoint,
        endpointValue: undefined,
        endpointEnvKeyHash: sha256(endpoint.endpointEnvKey).slice(0, 16)
      }))
    };
  }

  async createRpcEndpoint(input: {
    chainId: string;
    organizationId: string;
    projectId?: string;
    providerName: string;
    endpointEnvKey: string;
    redactedHost?: string;
    priority?: number;
    status?: "ACTIVE" | "DISABLED" | "ERROR" | "NOT_CONFIGURED";
    metadata?: Record<string, unknown>;
    actorUserId?: string;
    apiKeyId?: string;
    requestId?: string;
  }) {
    await this.requireChain(input.chainId);
    const existing = await prisma.chainRpcEndpoint.findFirst({
      where: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        chainId: input.chainId,
        providerName: input.providerName,
        endpointEnvKey: input.endpointEnvKey,
        deletedAt: null
      }
    });

    const endpoint = existing
      ? await prisma.chainRpcEndpoint.update({
          where: { id: existing.id },
          data: {
            redactedHost: input.redactedHost ?? null,
            priority: input.priority ?? 100,
            status: input.status ?? "NOT_CONFIGURED",
            metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
            deletedAt: null
          }
        })
      : await prisma.chainRpcEndpoint.create({
          data: {
            organizationId: input.organizationId,
            projectId: input.projectId ?? null,
            chainId: input.chainId,
            providerName: input.providerName,
            endpointEnvKey: input.endpointEnvKey,
            redactedHost: input.redactedHost ?? null,
            priority: input.priority ?? 100,
            status: input.status ?? "NOT_CONFIGURED",
            metadata: (input.metadata ?? {}) as Prisma.InputJsonValue
          }
        });

    await prisma.chainRegistryAuditEvent.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        chainId: input.chainId,
        actorUserId: input.actorUserId ?? null,
        apiKeyId: input.apiKeyId ?? null,
        action: "CHAIN_RPC_ENDPOINT_UPSERTED",
        resourceType: "CHAIN_RPC_ENDPOINT",
        resourceId: endpoint.id,
        requestId: input.requestId ?? null,
        metadata: {
          providerName: input.providerName,
          endpointEnvKeyHash: sha256(input.endpointEnvKey).slice(0, 16),
          redactedHost: input.redactedHost ?? null
        }
      }
    });

    return { endpoint: { ...endpoint, endpointValue: undefined } };
  }

  async validateAddress(chainId: string, address: string) {
    const chain = await this.requireChain(chainId);
    const normalized = normalizeAddressForChain(chain.chainType as any, address);
    return {
      chainId,
      chainType: chain.chainType,
      input: address,
      valid: Boolean(normalized),
      normalizedAddress: normalized,
      reason: normalized ? "VALID" : `Unsupported or invalid ${chain.chainType} address format`
    };
  }

  safetyPolicy() {
    return {
      realOnly: true,
      rawRpcUrlsPersisted: false,
      explorerApiKeysPersisted: false,
      nonEvmAdaptersExecutable: false,
      notes: [
        "P14 stores chain metadata, explorer metadata, feature support, and redacted RPC endpoint references only.",
        "RPC URLs and explorer API keys must be configured through environment variables or host secret managers.",
        "Non-EVM chains are registry-aware until a real analyzer/monitoring adapter is implemented."
      ]
    };
  }

  private async requireChain(chainId: string) {
    const chain = await prisma.chain.findFirst({ where: { id: chainId, deletedAt: null } });
    if (!chain) throw ApiError.notFound("Chain");
    return chain;
  }
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    const existing = map.get(value) ?? [];
    existing.push(item);
    map.set(value, existing);
  }
  return map;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
