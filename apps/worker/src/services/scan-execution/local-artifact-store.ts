import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { AnalyzerName } from "@audit-scanner/shared/queues/scan-jobs";
import { env } from "../../config/environment.js";
import { sha256File } from "./hash.js";
import { resolveWithinRoot, sanitizePathSegment, toPosixPath } from "./safe-path.js";
import type { ScannerArtifactDescriptor } from "./scanner-execution.types.js";
import {
  createDurableArtifactStore,
  type ArtifactMetadata,
  type DurableArtifactStore
} from "../artifacts/durable-artifact-store.js";

export interface ScannerRunWorkspace {
  artifactPrefix: string;
  tempHostPath: string;
  outputHostPath: string;
}

export class LocalScannerArtifactStore {
  private readonly artifactRoot = path.resolve(env.SCANNER_ARTIFACT_ROOT);
  private readonly tempRoot = path.resolve(env.SCANNER_TEMP_ROOT);
  private readonly durableStore: DurableArtifactStore;

  constructor(durableStore = createDurableArtifactStore()) {
    if (this.artifactRoot === this.tempRoot) {
      throw new Error("SCANNER_TEMP_ROOT must be different from SCANNER_ARTIFACT_ROOT");
    }
    this.durableStore = durableStore;
  }

  async resolvePreparedArtifact(preparedArtifactKey: string): Promise<string> {
    const localPath = resolveWithinRoot(this.artifactRoot, preparedArtifactKey);

    if (await exists(localPath)) {
      return localPath;
    }

    await this.durableStore.materialize(preparedArtifactKey, localPath);
    return localPath;
  }

  async createRunWorkspace(input: {
    scanId: string;
    analyzer: AnalyzerName;
  }): Promise<ScannerRunWorkspace> {
    const runId = `${Date.now()}-${cryptoRandomSuffix()}`;
    const artifactPrefix = toPosixPath(
      path.join(
        "scanner-runs",
        sanitizePathSegment(input.scanId),
        sanitizePathSegment(input.analyzer),
        runId
      )
    );
    const tempPrefix = toPosixPath(
      path.join(
        "scanner-runs",
        sanitizePathSegment(input.scanId),
        sanitizePathSegment(input.analyzer),
        runId
      )
    );
    const tempHostPath = resolveWithinRoot(this.tempRoot, tempPrefix);
    const outputHostPath = path.join(tempHostPath, "output");

    await fs.mkdir(outputHostPath, { recursive: true });
    await fs.chmod(outputHostPath, env.SCANNER_OUTPUT_DIRECTORY_MODE).catch(() => undefined);

    return {
      artifactPrefix,
      tempHostPath,
      outputHostPath
    };
  }

  async ensureDirectoryExists(directoryPath: string): Promise<void> {
    const stats = await fs.stat(directoryPath);
    if (!stats.isDirectory()) {
      throw new Error(`Prepared artifact must resolve to a directory: ${directoryPath}`);
    }
  }

  async writeTextArtifact(
    artifactPrefix: string,
    relativePath: string,
    content: string
  ): Promise<string> {
    const artifactKey = toPosixPath(path.join(artifactPrefix, relativePath));
    const filePath = resolveWithinRoot(this.artifactRoot, artifactKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    if (this.durableStore.driver === "s3") {
      await this.durableStore.writeText(artifactKey, content, guessContentType(relativePath));
    }
    return artifactKey;
  }

  async writeBinaryArtifact(
    artifactPrefix: string,
    relativePath: string,
    content: Buffer
  ): Promise<string> {
    const artifactKey = toPosixPath(path.join(artifactPrefix, relativePath));
    const filePath = resolveWithinRoot(this.artifactRoot, artifactKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    if (this.durableStore.driver === "s3") {
      await this.durableStore.writeBuffer(artifactKey, content, guessContentType(relativePath));
    }
    return artifactKey;
  }

  async writeJsonArtifact(
    artifactPrefix: string,
    relativePath: string,
    content: unknown
  ): Promise<string> {
    return this.writeTextArtifact(artifactPrefix, relativePath, `${JSON.stringify(content, null, 2)}\n`);
  }

  async readTextArtifact(artifactPrefix: string, relativePath: string): Promise<string | null> {
    const artifactKey = toPosixPath(path.join(artifactPrefix, relativePath));
    return this.readTextByArtifactKey(artifactKey);
  }

  async readTextByArtifactKey(artifactKey: string): Promise<string | null> {
    const filePath = resolveWithinRoot(this.artifactRoot, artifactKey);

    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return this.durableStore.readText(artifactKey);
      }
      throw error;
    }
  }

  async getArtifactMetadata(artifactKey: string): Promise<ArtifactMetadata | null> {
    const localPath = resolveWithinRoot(this.artifactRoot, artifactKey);
    const stats = await fs.stat(localPath).catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    });

    if (stats?.isFile()) {
      return {
        artifactKey,
        sizeBytes: stats.size,
        sha256: await sha256File(localPath),
        contentType: guessContentType(artifactKey)
      };
    }

    return this.durableStore.head(artifactKey);
  }

  async readRunOutputText(
    workspace: ScannerRunWorkspace,
    relativePath: string
  ): Promise<string | null> {
    const filePath = resolveWithinRoot(workspace.outputHostPath, relativePath);

    try {
      return await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async importRunOutput(
    workspace: ScannerRunWorkspace,
    limits: {
      maxArtifacts: number;
      maxBytes: number;
    }
  ): Promise<void> {
    const files = await collectFiles(workspace.outputHostPath);
    if (files.length > limits.maxArtifacts) {
      throw new Error(
        `Scanner output produced ${files.length} artifacts, limit is ${limits.maxArtifacts}`
      );
    }

    let totalBytes = 0;
    for (const filePath of files) {
      const stats = await fs.stat(filePath);
      totalBytes += stats.size;
      if (totalBytes > limits.maxBytes) {
        throw new Error(
          `Scanner output produced ${totalBytes} bytes, limit is ${limits.maxBytes}`
        );
      }
    }

    for (const filePath of files) {
      const relativePath = toPosixPath(path.relative(workspace.outputHostPath, filePath));
      const artifactKey = toPosixPath(path.join(workspace.artifactPrefix, relativePath));
      const destinationPath = resolveWithinRoot(this.artifactRoot, artifactKey);
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.copyFile(filePath, destinationPath);
      if (this.durableStore.driver === "s3") {
        await this.durableStore.writeBuffer(
          artifactKey,
          await fs.readFile(filePath),
          guessContentType(relativePath)
        );
      }
    }
  }

  async collectArtifacts(artifactPrefix: string): Promise<ScannerArtifactDescriptor[]> {
    const rootPath = resolveWithinRoot(this.artifactRoot, artifactPrefix);
    const files = await collectFiles(rootPath);

    return Promise.all(
      files.map(async (filePath) => {
        const relativePath = toPosixPath(path.relative(rootPath, filePath));
        const stats = await fs.stat(filePath);
        return {
          artifactKey: toPosixPath(path.join(artifactPrefix, relativePath)),
          relativePath,
          sizeBytes: stats.size,
          sha256: await sha256File(filePath),
          contentType: guessContentType(relativePath)
        };
      })
    );
  }

  async cleanupRunWorkspace(workspace: ScannerRunWorkspace): Promise<void> {
    if (!env.SCANNER_CLEANUP_TEMP_WORKSPACE) {
      return;
    }

    await fs.rm(workspace.tempHostPath, {
      recursive: true,
      force: true,
      maxRetries: 2,
      retryDelay: 100
    });
  }

  async cleanupStaleRunWorkspaces(retentionMs = env.SCANNER_TEMP_RETENTION_MS): Promise<number> {
    const scannerRunsRoot = path.join(this.tempRoot, "scanner-runs");
    const runDirectories = await collectDirectoriesAtDepth(scannerRunsRoot, 3);
    const cutoffMs = Date.now() - retentionMs;
    let removedCount = 0;

    for (const runDirectory of runDirectories) {
      const stats = await fs.stat(runDirectory).catch((error: unknown) => {
        if (isNodeError(error) && error.code === "ENOENT") {
          return null;
        }
        throw error;
      });

      if (stats && stats.mtimeMs < cutoffMs) {
        await fs.rm(runDirectory, {
          recursive: true,
          force: true,
          maxRetries: 2,
          retryDelay: 100
        });
        removedCount += 1;
      }
    }

    return removedCount;
  }
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function collectFiles(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true }).catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function collectDirectoriesAtDepth(root: string, depth: number): Promise<string[]> {
  if (depth === 0) {
    return [root];
  }

  const entries = await fs.readdir(root, { withFileTypes: true }).catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const directories: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      directories.push(...(await collectDirectoriesAtDepth(path.join(root, entry.name), depth - 1)));
    }
  }

  return directories;
}

function guessContentType(relativePath: string): string {
  if (relativePath.endsWith(".json")) {
    return "application/json";
  }
  if (relativePath.endsWith(".log") || relativePath.endsWith(".txt")) {
    return "text/plain";
  }
  return "application/octet-stream";
}

function cryptoRandomSuffix(): string {
  return randomBytes(6).toString("hex");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
