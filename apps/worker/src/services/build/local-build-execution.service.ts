import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@audit-scanner/database";
import type { BuildJobData } from "@audit-scanner/shared/queues/scan-jobs";
import { env } from "../../config/environment.js";
import type { BuildExecutionResult, BuildExecutionService } from "../scan-services.js";
import { createDurableArtifactStore } from "../artifacts/durable-artifact-store.js";
import { resolveWithinRoot } from "../scan-execution/safe-path.js";

type BuildToolKind =
  | "FOUNDRY"
  | "HARDHAT"
  | "TRUFFLE"
  | "NPM_SOLIDITY"
  | "PLAIN_SOLIDITY"
  | "UNKNOWN";

interface DetectedBuildProfile {
  toolKind: BuildToolKind;
  toolName: string;
  configFile?: string;
  confidence: string;
  detectionReason: string;
}

/**
 * P3/P26-safe local build-profile detector.
 *
 * This service intentionally does not run arbitrary package installs or shell commands.
 * It records real build profile evidence from the prepared source tree and leaves
 * compiler artifact/test execution as NOT_ASSESSED unless a later safe adapter runs it.
 */
export class LocalBuildExecutionService implements BuildExecutionService {
  private readonly artifactRoot = path.resolve(env.SCANNER_ARTIFACT_ROOT);
  private readonly tempRoot = path.resolve(env.SCANNER_TEMP_ROOT);
  private readonly artifactStore = createDurableArtifactStore();

  async detectBuildProfile(data: BuildJobData, signal?: AbortSignal): Promise<BuildExecutionResult> {
    signal?.throwIfAborted();

    const workspace = await this.materializePreparedSource(data, signal);
    const startedAt = new Date();
    const detected = await detectBuildProfile(workspace);
    const finishedAt = new Date();
    const durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

    const buildProfile = await prisma.buildProfile.create({
      data: {
        organizationId: data.organizationId,
        scanId: data.scanId,
        toolKind: detected.toolKind,
        toolName: detected.toolName,
        projectRoot: data.preparedArtifactKey,
        confidence: detected.confidence,
        detectionReason: detected.detectionReason,
        ...(detected.configFile ? { configFile: detected.configFile } : {}),
        metadata: {
          source: "local-build-profile-detector",
          realExecution: false,
          note: "Build/test execution is not fabricated; compiler artifacts and tests remain not assessed unless produced by a configured adapter."
        }
      }
    });

    const buildRun = await prisma.buildRun.create({
      data: {
        buildProfileId: buildProfile.id,
        organizationId: data.organizationId,
        scanId: data.scanId,
        toolKind: detected.toolKind,
        command: "detect-build-profile-only",
        status: "NOT_ASSESSED",
        startedAt,
        finishedAt,
        durationMs,
        errorCategory: "BUILD_EXECUTION_NOT_CONFIGURED",
        metadata: {
          analyzers: data.analyzers,
          preparedArtifactKey: data.preparedArtifactKey,
          reason: "No safe build/test adapter executed in this pass."
        }
      }
    });

    return {
      buildRunId: buildRun.id,
      compilerArtifactCount: 0,
      testRunCount: 0,
      status: buildRun.status
    };
  }

  private async materializePreparedSource(data: BuildJobData, signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    const localPath = resolveWithinRoot(this.artifactRoot, data.preparedArtifactKey);
    if (await exists(localPath)) {
      return localPath;
    }

    const tempPath = resolveWithinRoot(
      this.tempRoot,
      path.join("build-profile", data.organizationId, `${data.scanId}-${Date.now()}`)
    );
    await fs.rm(tempPath, { recursive: true, force: true });
    await fs.mkdir(tempPath, { recursive: true });
    await this.artifactStore.materialize(data.preparedArtifactKey, tempPath);
    return tempPath;
  }
}

async function detectBuildProfile(root: string): Promise<DetectedBuildProfile> {
  const foundryToml = path.join(root, "foundry.toml");
  if (await exists(foundryToml)) {
    return {
      toolKind: "FOUNDRY",
      toolName: "foundry",
      configFile: "foundry.toml",
      confidence: "0.95",
      detectionReason: "foundry.toml was present in the prepared source artifact"
    };
  }

  const hardhatConfig = await firstExisting(root, [
    "hardhat.config.ts",
    "hardhat.config.js",
    "hardhat.config.cjs",
    "hardhat.config.mjs"
  ]);
  if (hardhatConfig) {
    return {
      toolKind: "HARDHAT",
      toolName: "hardhat",
      configFile: hardhatConfig,
      confidence: "0.9",
      detectionReason: `${hardhatConfig} was present in the prepared source artifact`
    };
  }

  const truffleConfig = await firstExisting(root, ["truffle-config.js", "truffle.js"]);
  if (truffleConfig) {
    return {
      toolKind: "TRUFFLE",
      toolName: "truffle",
      configFile: truffleConfig,
      confidence: "0.85",
      detectionReason: `${truffleConfig} was present in the prepared source artifact`
    };
  }

  const hasPackageJson = await exists(path.join(root, "package.json"));
  const solidityFiles = await collectFiles(root, ".sol", 1);
  if (hasPackageJson && solidityFiles.length > 0) {
    return {
      toolKind: "NPM_SOLIDITY",
      toolName: "npm-solidity-project",
      configFile: "package.json",
      confidence: "0.65",
      detectionReason: "package.json and Solidity source files were present"
    };
  }

  if (solidityFiles.length > 0) {
    return {
      toolKind: "PLAIN_SOLIDITY",
      toolName: "plain-solidity",
      confidence: "0.55",
      detectionReason: "Solidity files were present without a known framework config"
    };
  }

  return {
    toolKind: "UNKNOWN",
    toolName: "unknown",
    confidence: "0",
    detectionReason: "No supported build profile evidence was found in the prepared artifact"
  };
}

async function firstExisting(root: string, candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await exists(path.join(root, candidate))) {
      return candidate;
    }
  }
  return undefined;
}

async function collectFiles(root: string, suffix: string, limit: number): Promise<string[]> {
  const found: string[] = [];

  async function walk(current: string): Promise<void> {
    if (found.length >= limit) {
      return;
    }
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (found.length >= limit || entry.name === "node_modules" || entry.name === ".git") {
        continue;
      }
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(suffix)) {
        found.push(entryPath);
      }
    }
  }

  await walk(root);
  return found;
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true).catch(() => false);
}
