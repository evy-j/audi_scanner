import { PrismaClient } from "@prisma/client";
import { defaultChainRegistry } from "../../shared/src/chains/chain-registry.ts";

const prisma = new PrismaClient();

async function main() {
  const results = [];
  for (const item of defaultChainRegistry) {
    const chain = await prisma.chain.upsert({
      where: { slug: item.slug },
      update: {
        name: item.name,
        chainType: item.chainType,
        environment: item.environment,
        status: "ACTIVE",
        networkId: item.networkId ?? null,
        caip2Id: item.caip2Id ?? null,
        nativeSymbol: item.nativeSymbol,
        deletedAt: null
      },
      create: {
        name: item.name,
        slug: item.slug,
        chainType: item.chainType,
        environment: item.environment,
        status: "ACTIVE",
        networkId: item.networkId ?? null,
        caip2Id: item.caip2Id ?? null,
        nativeSymbol: item.nativeSymbol
      }
    });

    if (item.explorer) {
      const existingExplorer = await prisma.chainExplorer.findFirst({
        where: { chainId: chain.id, name: item.explorer.name, deletedAt: null }
      });
      if (!existingExplorer) {
        await prisma.chainExplorer.create({
          data: {
            chainId: chain.id,
            name: item.explorer.name,
            baseUrl: item.explorer.baseUrl,
            apiBaseUrl: item.explorer.apiBaseUrl ?? null,
            apiKeyEnvKey: item.explorer.apiBaseUrl ? `${item.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_EXPLORER_API_KEY` : null,
            status: "ACTIVE",
            supportsContractVerification: Boolean(item.explorer.supportsContractVerification),
            metadata: { seeded: true, seedVersion: "p14-chain-registry/v1" }
          }
        });
      }
    }

    for (const [featureKey, status] of Object.entries(item.features)) {
      await prisma.chainFeatureSupport.upsert({
        where: { chainId_featureKey: { chainId: chain.id, featureKey } },
        update: {
          status,
          notes: item.notes ?? null,
          metadata: { seeded: true, seedVersion: "p14-chain-registry/v1" }
        },
        create: {
          chainId: chain.id,
          featureKey,
          status,
          notes: item.notes ?? null,
          metadata: { seeded: true, seedVersion: "p14-chain-registry/v1" }
        }
      });
    }

    results.push({ slug: chain.slug, name: chain.name, networkId: chain.networkId });
  }

  console.log(JSON.stringify({ seeded: results.length, chains: results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
