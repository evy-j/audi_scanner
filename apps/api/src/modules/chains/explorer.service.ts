import { createHash } from "node:crypto";
import { prisma } from "../../infra/prisma/prisma.js";
import { ApiError } from "../../common/errors/api-error.js";
import { logger } from "../../common/logging/logger.js";
import { normalizeAddressForChain } from "@audit-scanner/shared";
import { UsageLimitService } from "../usage/usage-limits.service.js";
import { ScansService } from "../scans/scans.service.js";
import { createSourceArtifactStore } from "../source-ingestion/source-artifact-store.js";
import { evaluateSourceFiles, type SourceFileCandidate } from "../source-ingestion/source-policy.js";
import { EtherscanStyleExplorerAdapter, type ExplorerSource } from "./explorer-adapter.js";
import type { FetchExplorerSourceBody, ScanExplorerSourceBody } from "./explorer.schemas.js";

const db = prisma as any;

type Actor = { userId?: string | undefined; apiKeyId?: string | undefined; permissions?: string[] | undefined; requestId?: string | undefined };

export class ChainExplorerService {
  constructor(
    private readonly explorer = new EtherscanStyleExplorerAdapter(),
    private readonly usage = new UsageLimitService(),
    private readonly scans = new ScansService()
  ) {}

  async getVerification(chainId: string, address: string, organizationId?: string, projectId?: string) {
    const context = await this.context(chainId, address);
    const verification = await db.contractVerification.findFirst({
      where: {
        chainId,
        normalizedAddress: context.normalizedAddress,
        deletedAt: null,
        ...(organizationId ? { organizationId } : {}),
        ...(projectId ? { projectId } : {})
      },
      orderBy: { createdAt: "desc" }
    });
    const abi = await db.contractAbi.findFirst({
      where: { chainId, normalizedAddress: context.normalizedAddress, ...(organizationId ? { organizationId } : {}) },
      orderBy: { createdAt: "desc" }
    });
    return {
      chain: context.chain,
      address,
      normalizedAddress: context.normalizedAddress,
      verification,
      abi: abi ? { id: abi.id, status: abi.status, abiChecksum: abi.abiChecksum, fetchedAt: abi.fetchedAt } : null,
      explorerLinks: context.explorer ? {
        addressUrl: this.explorer.buildAddressUrl(context.explorer.baseUrl, context.normalizedAddress)
      } : null,
      limitations: this.limitations(context)
    };
  }

  async fetchVerifiedSource(chainId: string, address: string, input: FetchExplorerSourceBody, actor: Actor) {
    await this.assertOrgAccess(input.organizationId, actor, "source_artifacts.monthly");
    const context = await this.context(chainId, address);
    const run = await db.explorerFetchRun.create({ data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      chainId,
      explorerId: context.explorer?.id ?? null,
      contractAddress: address,
      normalizedAddress: context.normalizedAddress,
      status: "RUNNING",
      action: "FETCH_SOURCE",
      providerName: context.explorer?.name ?? null,
      requestId: actor.requestId ?? null,
      metadata: { rawApiKeyPersisted: false }
    }});

    if (!context.explorer?.apiBaseUrl || !context.explorer.supportsContractVerification) {
      return this.finishRun(run.id, "NOT_ASSESSED", {
        status: "NOT_ASSESSED",
        message: "Explorer verification API is not supported for this chain",
        runId: run.id
      });
    }

    const outcome = await this.explorer.fetchVerifiedSource({
      name: context.explorer.name,
      apiBaseUrl: context.explorer.apiBaseUrl,
      apiKeyEnvKey: context.explorer.apiKeyEnvKey,
      networkId: context.chain.networkId
    }, context.normalizedAddress, input.includeAbi);

    if (outcome.status !== "VERIFIED") {
      await this.persistVerification({
        organizationId: input.organizationId,
        projectId: input.projectId,
        chainId,
        address,
        normalizedAddress: context.normalizedAddress,
        explorerId: context.explorer.id,
        explorerProvider: context.explorer.name,
        status: mapVerificationStatus(outcome.status),
        errorCategory: outcome.status,
        metadata: { message: outcome.message }
      });
      return this.finishRun(run.id, outcome.status, { status: outcome.status, message: outcome.message, runId: run.id });
    }

    let artifact: any = null;
    if (input.createSourceArtifact) {
      await this.usage.assertAndConsume(input.organizationId, "SOURCE_ARTIFACTS_PER_MONTH", { resourceType: "SOURCE_ARTIFACT" });
      artifact = await this.persistExplorerSourceArtifact({
        organizationId: input.organizationId,
        projectId: input.projectId,
        chainId,
        address,
        normalizedAddress: context.normalizedAddress,
        source: outcome.source,
        maxFileBytes: input.maxFileBytes,
        maxTotalBytes: input.maxTotalBytes,
        actor
      });
    }

    const verification = await this.persistVerification({
      organizationId: input.organizationId,
      projectId: input.projectId,
      chainId,
      address,
      normalizedAddress: context.normalizedAddress,
      explorerId: context.explorer.id,
      explorerProvider: context.explorer.name,
      status: "VERIFIED",
      sourceArtifactId: artifact?.id,
      source: outcome.source,
      abi: outcome.abi
    });

    await this.persistSourceFiles(verification.id, input.organizationId, input.projectId, chainId, context.normalizedAddress, artifact?.storageKey, outcome.source);
    await this.persistAbi(verification.id, input.organizationId, input.projectId, chainId, context.normalizedAddress, outcome.abi, outcome.source.abiChecksum);
    await this.finishRun(run.id, "VERIFIED", { verificationId: verification.id, sourceArtifactId: artifact?.id ?? null });

    return {
      status: "VERIFIED",
      runId: run.id,
      verification,
      sourceArtifact: artifact,
      abiAvailable: Boolean(outcome.abi),
      explorerLinks: { addressUrl: this.explorer.buildAddressUrl(context.explorer.baseUrl, context.normalizedAddress) },
      limitations: []
    };
  }

  async scanVerifiedContract(chainId: string, address: string, input: ScanExplorerSourceBody, actor: Actor) {
    if (!actor.userId) throw ApiError.unauthorized();
    await this.assertOrgAccess(input.organizationId, actor, "scans.monthly");
    const context = await this.context(chainId, address);
    let latest = await db.contractVerification.findFirst({
      where: { organizationId: input.organizationId, chainId, normalizedAddress: context.normalizedAddress, status: "VERIFIED", deletedAt: null },
      orderBy: { createdAt: "desc" }
    });
    if (!latest?.sourceArtifactId && input.fetchIfMissing) {
      const fetched = await this.fetchVerifiedSource(chainId, address, {
        organizationId: input.organizationId,
        projectId: input.projectId,
        includeAbi: true,
        createSourceArtifact: true
      }, actor) as {
        status: string;
        sourceArtifact?: { id?: string | null } | null;
        verification?: typeof latest;
      };
      if (fetched.status !== "VERIFIED" || !fetched.sourceArtifact?.id) return fetched;
      latest = fetched.verification ?? latest;
    }
    if (!latest?.sourceArtifactId) {
      throw ApiError.conflict("Verified source artifact is not available for this contract");
    }

    const artifact = await db.sourceArtifact.findFirst({ where: { id: latest.sourceArtifactId, organizationId: input.organizationId, status: "STORED", deletedAt: null } });
    if (!artifact?.storageKey) throw ApiError.conflict("Verified source artifact is not STORED");

    const scan = await this.scans.create({
      organizationId: input.organizationId,
      projectId: input.projectId ?? artifact.projectId ?? undefined,
      chainId,
      title: input.title ?? `Contract scan ${context.normalizedAddress} on ${context.chain.name}`,
      priority: input.priority,
      sourceArtifactId: artifact.id,
      target: { type: "SOURCE", chainId, address: context.normalizedAddress, artifactKey: artifact.storageKey },
      analyzers: input.analyzers
    }, actor.userId, { correlationId: latest.id });

    await db.contractVerification.update({ where: { id: latest.id }, data: { scanId: scan.id } }).catch(() => undefined);
    return { status: "QUEUED", scan, sourceArtifact: artifact, verification: latest };
  }

  private async context(chainId: string, address: string) {
    const chain = await db.chain.findFirst({ where: { id: chainId, deletedAt: null } });
    if (!chain) throw ApiError.notFound("Chain");
    const normalizedAddress = normalizeAddressForChain(chain.chainType, address);
    if (!normalizedAddress) throw ApiError.badRequest(`Unsupported or invalid ${chain.chainType} address format`);
    const explorer = await db.chainExplorer.findFirst({ where: { chainId, deletedAt: null, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
    return { chain, explorer, normalizedAddress };
  }

  private limitations(context: { chain: any; explorer: any }) {
    const notes: string[] = [];
    if (context.chain.chainType !== "EVM") notes.push("Executable explorer source scanning is available for EVM chains only in P14B.");
    if (!context.explorer?.apiBaseUrl) notes.push("Explorer API is not configured for this chain.");
    if (context.explorer && !context.explorer.supportsContractVerification) notes.push("Explorer does not advertise contract verification support.");
    return notes;
  }

  private async persistExplorerSourceArtifact(input: { organizationId: string; projectId?: string; chainId: string; address: string; normalizedAddress: string; source: ExplorerSource; maxFileBytes?: number; maxTotalBytes?: number; actor: Actor }) {
    const files: SourceFileCandidate[] = input.source.sourceFiles.map((file) => ({ path: file.path, content: Buffer.from(file.content, "utf8") }));
    const evaluation = evaluateSourceFiles(files, { maxFileBytes: input.maxFileBytes, maxTotalBytes: input.maxTotalBytes });
    if (evaluation.files.length === 0) {
      throw ApiError.conflict("Explorer source was rejected by source policy");
    }
    const artifact = await db.sourceArtifact.create({ data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      originKind: "EXPLORER_VERIFIED_SOURCE",
      status: "INGESTING",
      createdByUserId: input.actor.userId ?? null,
      metadata: { chainId: input.chainId, address: input.normalizedAddress, provenance: "explorer_verified_source" }
    }});
    const run = await db.sourceIngestionRun.create({ data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      sourceArtifactId: artifact.id,
      originKind: "EXPLORER_VERIFIED_SOURCE",
      status: "INGESTING",
      createdByUserId: input.actor.userId ?? null,
      apiKeyId: input.actor.apiKeyId ?? null,
      metadata: { chainId: input.chainId, address: input.normalizedAddress }
    }});
    const storageKey = `source-artifacts/${input.organizationId}/${artifact.id}/source`;
    const store = createSourceArtifactStore();
    await store.writeSourceDirectory(storageKey, evaluation.files.map((file) => ({ path: file.path, content: file.content, contentType: file.contentType })), evaluation.manifest);
    const completed = await db.$transaction(async (tx: any) => {
      const updated = await tx.sourceArtifact.update({ where: { id: artifact.id }, data: {
        status: "STORED",
        storageKey,
        archiveChecksum: evaluation.archiveChecksum,
        archiveSizeBytes: BigInt(evaluation.totalSizeBytes),
        fileCount: evaluation.files.length,
        totalSizeBytes: BigInt(evaluation.totalSizeBytes),
        ignoredFileCount: evaluation.ignored.length,
        rejectedFileCount: evaluation.rejected.length,
        storedAt: new Date()
      }});
      await tx.sourceManifest.create({ data: {
        organizationId: input.organizationId,
        projectId: input.projectId ?? null,
        sourceArtifactId: artifact.id,
        manifestChecksum: evaluation.manifestChecksum,
        fileCount: evaluation.files.length,
        totalSizeBytes: BigInt(evaluation.totalSizeBytes),
        ignoredFileCount: evaluation.ignored.length,
        rejectedFileCount: evaluation.rejected.length,
        manifest: evaluation.manifest
      }});
      for (const file of evaluation.files) {
        await tx.sourceFileEntry.create({ data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          sourceArtifactId: artifact.id,
          path: file.path,
          storageKey: `${storageKey}/${file.path}`,
          checksum: file.checksum,
          sizeBytes: BigInt(file.sizeBytes),
          contentType: file.contentType,
          policyStatus: "ALLOWED"
        }});
      }
      for (const decision of evaluation.decisions) {
        await tx.sourcePolicyDecision.create({ data: {
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          sourceArtifactId: artifact.id,
          sourceIngestionRunId: run.id,
          status: decision.status,
          path: decision.path,
          reason: decision.reason,
          category: decision.category ?? null
        }});
      }
      await tx.sourceIngestionRun.update({ where: { id: run.id }, data: { status: "STORED", completedAt: new Date() } });
      return updated;
    });
    return completed;
  }

  private async persistVerification(input: { organizationId?: string; projectId?: string; chainId: string; address: string; normalizedAddress: string; explorerId?: string; explorerProvider?: string; status: string; sourceArtifactId?: string; source?: ExplorerSource; abi?: unknown[] | null; errorCategory?: string; metadata?: unknown }) {
    const contract = input.status === "VERIFIED" ? await db.contract.upsert({
      where: { chainId_normalizedAddress: { chainId: input.chainId, normalizedAddress: input.normalizedAddress } },
      update: {
        organizationId: input.organizationId ?? undefined,
        name: input.source?.contractName ?? undefined,
        language: input.source?.language ?? "UNKNOWN",
        status: "VERIFIED",
        compilerVersion: input.source?.compilerVersion ?? undefined,
        sourceHash: input.source?.sourceChecksum ?? undefined,
        metadata: { source: "explorer" }
      },
      create: {
        organizationId: input.organizationId ?? null,
        chainId: input.chainId,
        address: input.address,
        normalizedAddress: input.normalizedAddress,
        name: input.source?.contractName ?? null,
        language: input.source?.language ?? "UNKNOWN",
        status: "VERIFIED",
        compilerVersion: input.source?.compilerVersion ?? null,
        sourceHash: input.source?.sourceChecksum ?? null,
        metadata: { source: "explorer" }
      }
    }).catch((error: unknown) => { logger.warn({ err: error }, "contract upsert failed"); return null; }) : null;

    return db.contractVerification.create({ data: {
      organizationId: input.organizationId ?? null,
      projectId: input.projectId ?? null,
      chainId: input.chainId,
      contractId: contract?.id ?? null,
      sourceArtifactId: input.sourceArtifactId ?? null,
      explorerId: input.explorerId ?? null,
      address: input.address,
      normalizedAddress: input.normalizedAddress,
      status: input.status,
      explorerProvider: input.explorerProvider ?? null,
      contractName: input.source?.contractName ?? null,
      compilerVersion: input.source?.compilerVersion ?? null,
      language: input.source?.language ?? "UNKNOWN",
      sourceChecksum: input.source?.sourceChecksum ?? null,
      abiChecksum: input.source?.abiChecksum ?? null,
      proxyImplementationAddress: input.source?.proxyImplementationAddress ?? null,
      fetchedAt: new Date(),
      errorCategory: input.errorCategory ?? null,
      metadata: input.metadata ?? { abiAvailable: Boolean(input.abi) }
    }});
  }

  private async persistSourceFiles(verificationId: string, organizationId: string, projectId: string | undefined, chainId: string, address: string, storageKey: string | undefined, source: ExplorerSource) {
    for (const file of source.sourceFiles) {
      await db.contractSourceFile.create({ data: {
        organizationId,
        projectId: projectId ?? null,
        verificationId,
        chainId,
        address,
        path: file.path,
        checksum: sha256(file.content),
        sizeBytes: BigInt(Buffer.byteLength(file.content, "utf8")),
        storageKey: storageKey ? `${storageKey}/${file.path}` : null,
        metadata: { source: "explorer" }
      }});
    }
  }

  private async persistAbi(verificationId: string, organizationId: string, projectId: string | undefined, chainId: string, address: string, abi: unknown[] | null | undefined, abiChecksum: string | null | undefined) {
    await db.contractAbi.create({ data: {
      organizationId,
      projectId: projectId ?? null,
      verificationId,
      chainId,
      address,
      normalizedAddress: address,
      abi: abi ?? undefined,
      abiChecksum: abiChecksum ?? null,
      status: abi ? "VERIFIED" : "NOT_ASSESSED",
      fetchedAt: abi ? new Date() : null,
      metadata: { source: abi ? "explorer" : "abi_unavailable" }
    }});
  }

  private async finishRun(runId: string, status: string, metadata: unknown) {
    await db.explorerFetchRun.update({ where: { id: runId }, data: { status, finishedAt: new Date(), metadata } }).catch(() => undefined);
    return metadata;
  }

  private async assertOrgAccess(organizationId: string, actor: Actor, _permission: string) {
    if (actor.apiKeyId) return;
    if (!actor.userId) throw ApiError.unauthorized();
    const member = await db.organizationMember.findFirst({ where: { organizationId, userId: actor.userId, status: "ACTIVE", deletedAt: null } });
    if (!member) throw ApiError.accessDenied("Access denied");
  }
}

function mapVerificationStatus(status: string) {
  if (status === "PROVIDER_NOT_CONFIGURED") return "PROVIDER_NOT_CONFIGURED";
  if (status === "RATE_LIMITED") return "RATE_LIMITED";
  if (status === "NOT_VERIFIED") return "NOT_VERIFIED";
  if (status === "FAILED") return "FAILED";
  return "NOT_ASSESSED";
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
