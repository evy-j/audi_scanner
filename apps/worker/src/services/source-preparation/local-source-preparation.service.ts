import { promises as fs } from "node:fs";
import path from "node:path";
import type { SourcePrepareJobData } from "@audit-scanner/shared/queues/scan-jobs";
import { env } from "../../config/environment.js";
import type { PreparedSourceResult, SourcePreparationService } from "../scan-services.js";
import { resolveWithinRoot, sanitizePathSegment, toPosixPath } from "../scan-execution/safe-path.js";
import { createDurableArtifactStore } from "../artifacts/durable-artifact-store.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "cache",
  "out",
  "artifacts",
  "broadcast",
  "coverage",
  "dist",
  "build"
]);

const MAX_PREPARED_FILES = 5_000;
const MAX_PREPARED_BYTES = 512 * 1024 * 1024;

export class LocalSourcePreparationService implements SourcePreparationService {
  private readonly artifactRoot = path.resolve(env.SCANNER_ARTIFACT_ROOT);
  private readonly tempRoot = path.resolve(env.SCANNER_TEMP_ROOT);
  private readonly artifactStore = createDurableArtifactStore();

  async prepare(
    data: SourcePrepareJobData,
    signal?: AbortSignal
  ): Promise<PreparedSourceResult> {
    signal?.throwIfAborted();

    if (data.target.type !== "SOURCE" && data.target.type !== "BYTECODE") {
      throw new Error(
        `Local source preparation only supports SOURCE and BYTECODE artifactKey targets; received ${data.target.type}`
      );
    }

    if (!data.target.artifactKey) {
      throw new Error("Local source preparation requires target.artifactKey");
    }

    const preparedArtifactKey = toPosixPath(
      path.join(
        "prepared-sources",
        sanitizePathSegment(data.organizationId),
        sanitizePathSegment(data.scanId)
      )
    );
    const preparedPath = resolveWithinRoot(this.artifactRoot, preparedArtifactKey);
    const stagingPath = resolveWithinRoot(
      this.tempRoot,
      path.join(
        "source-prepare",
        sanitizePathSegment(data.organizationId),
        `${sanitizePathSegment(data.scanId)}-${Date.now()}`
      )
    );
    const sourceInputPath = path.join(stagingPath, "source");
    const preparedStagingPath = path.join(stagingPath, "prepared");

    await fs.rm(stagingPath, { recursive: true, force: true });
    await fs.mkdir(sourceInputPath, { recursive: true });

    const state = { files: 0, bytes: 0 };
    await this.artifactStore.materialize(data.target.artifactKey, sourceInputPath);
    await copyDirectory(sourceInputPath, preparedStagingPath, state, signal);

    await assertPreparedWorkspaceHasSupportedInput(preparedStagingPath, data.target.type);
    await fs.rm(preparedPath, { recursive: true, force: true });
    await fs.mkdir(path.dirname(preparedPath), { recursive: true });
    await fs.rename(preparedStagingPath, preparedPath);
    if (this.artifactStore.driver === "s3") {
      await this.artifactStore.uploadDirectory(preparedArtifactKey, preparedPath);
    }
    await fs.rm(stagingPath, { recursive: true, force: true });

    const framework = await detectFramework(preparedPath);
    const compilerVersion = await detectCompilerVersion(preparedPath);

    return {
      preparedArtifactKey,
      framework,
      ...(compilerVersion ? { compilerVersion } : {})
    };
  }
}

async function copyDirectory(
  sourceRoot: string,
  destinationRoot: string,
  state: { files: number; bytes: number },
  signal?: AbortSignal
): Promise<void> {
  const entries = await fs.readdir(sourceRoot, { withFileTypes: true });

  for (const entry of entries) {
    signal?.throwIfAborted();

    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceRoot, entry.name);
    const destinationPath = path.join(destinationRoot, entry.name);

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      await fs.mkdir(destinationPath, { recursive: true });
      await copyDirectory(sourcePath, destinationPath, state, signal);
      continue;
    }

    if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath, state, signal);
    }
  }
}

async function copyFile(
  sourcePath: string,
  destinationPath: string,
  state: { files: number; bytes: number },
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted();

  const stats = await fs.stat(sourcePath);
  state.files += 1;
  state.bytes += stats.size;

  if (state.files > MAX_PREPARED_FILES) {
    throw new Error(`Prepared source contains too many files; limit is ${MAX_PREPARED_FILES}`);
  }

  if (state.bytes > MAX_PREPARED_BYTES) {
    throw new Error(`Prepared source is too large; limit is ${MAX_PREPARED_BYTES} bytes`);
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

async function assertPreparedWorkspaceHasSupportedInput(
  preparedPath: string,
  targetType: SourcePrepareJobData["target"]["type"]
): Promise<void> {
  if (targetType === "BYTECODE") {
    return;
  }

  const solidityFiles = await collectSolidityFiles(preparedPath);
  if (solidityFiles.length === 0) {
    throw new Error("Prepared SOURCE artifact must contain at least one .sol file");
  }
}

async function collectSolidityFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await walk(entryPath);
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".sol")) {
        files.push(entryPath);
      }
    }
  }

  await walk(root);
  return files.sort();
}

async function detectFramework(root: string): Promise<"hardhat" | "foundry" | "unknown"> {
  const foundry = await exists(path.join(root, "foundry.toml"));
  if (foundry) {
    return "foundry";
  }

  const hardhatConfigs = await Promise.all([
    exists(path.join(root, "hardhat.config.ts")),
    exists(path.join(root, "hardhat.config.js")),
    exists(path.join(root, "hardhat.config.cjs")),
    exists(path.join(root, "hardhat.config.mjs"))
  ]);

  return hardhatConfigs.some(Boolean) ? "hardhat" : "unknown";
}

async function detectCompilerVersion(root: string): Promise<string | undefined> {
  const solidityFiles = await collectSolidityFiles(root);
  const firstSolidityFile = solidityFiles[0];
  if (!firstSolidityFile) {
    return undefined;
  }

  const source = await fs.readFile(firstSolidityFile, "utf8");
  const pragma = source.match(/pragma\s+solidity\s+([^;]+);/u);
  return pragma?.[1]?.trim();
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
