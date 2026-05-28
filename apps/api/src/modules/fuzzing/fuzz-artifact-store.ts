import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/environment.js";
import { redactSecrets } from "../remediation/redaction.js";

export interface FuzzArtifactStore {
  writeJsonArtifact(prefix: string, relativePath: string, content: unknown): Promise<StoredFuzzArtifact>;
  writeTextArtifact(prefix: string, relativePath: string, content: string): Promise<StoredFuzzArtifact>;
}

export interface StoredFuzzArtifact {
  artifactKey: string;
  checksum: string;
  sizeBytes: number;
}

export class LocalFuzzArtifactStore implements FuzzArtifactStore {
  private readonly artifactRoot = path.resolve(env.LOCAL_ARTIFACT_DIR);

  writeJsonArtifact(prefix: string, relativePath: string, content: unknown): Promise<StoredFuzzArtifact> {
    return this.writeTextArtifact(prefix, relativePath, `${JSON.stringify(content, null, 2)}\n`);
  }

  async writeTextArtifact(prefix: string, relativePath: string, content: string): Promise<StoredFuzzArtifact> {
    const artifactKey = toPosixPath(path.join(prefix, relativePath));
    const filePath = resolveWithinRoot(this.artifactRoot, artifactKey);
    const body = redactSecrets(content);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body, "utf8");
    return {
      artifactKey,
      checksum: sha256(body),
      sizeBytes: Buffer.byteLength(body)
    };
  }
}

export function fuzzArtifactPrefix(scanId: string, findingId?: string | null): string {
  return toPosixPath(
    path.join(
      "fuzzing",
      sanitizePathSegment(scanId),
      sanitizePathSegment(findingId ?? "scan"),
      `${Date.now()}-${randomBytes(4).toString("hex")}`
    )
  );
}

function resolveWithinRoot(root: string, unsafeRelativePath: string): string {
  const target = path.resolve(root, unsafeRelativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Fuzz artifact path escapes configured artifact root");
  }
  return target;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 160);
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
