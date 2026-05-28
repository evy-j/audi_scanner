import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/environment.js";

export interface StoredMonitorArtifact {
  artifactKey: string;
  checksum: string;
  sizeBytes: number;
}

export interface MonitorArtifactStore {
  writeJsonArtifact(prefix: string, relativePath: string, value: unknown): Promise<StoredMonitorArtifact>;
}

export class LocalMonitorArtifactStore implements MonitorArtifactStore {
  async writeJsonArtifact(prefix: string, relativePath: string, value: unknown): Promise<StoredMonitorArtifact> {
    const content = JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item), 2);
    const artifactKey = path.posix.join(prefix, sanitizePathSegment(relativePath));
    const root = path.resolve(env.LOCAL_ARTIFACT_DIR);
    const filePath = resolveWithin(root, artifactKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    return {
      artifactKey,
      checksum: createHash("sha256").update(content).digest("hex"),
      sizeBytes: Buffer.byteLength(content)
    };
  }
}

export function monitorArtifactPrefix(projectId: string, runId: string): string {
  return path.posix.join("monitoring", sanitizePathSegment(projectId), sanitizePathSegment(runId));
}

function resolveWithin(root: string, artifactKey: string): string {
  const target = path.resolve(root, artifactKey);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Monitor artifact path escapes artifact root");
  }
  return target;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._/-]/gu, "_").slice(0, 220);
}
