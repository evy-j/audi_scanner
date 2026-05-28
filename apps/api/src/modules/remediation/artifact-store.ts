import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface RemediationArtifactStore {
  writeJsonArtifact(
    artifactPrefix: string,
    relativePath: string,
    content: unknown
  ): Promise<{ artifactKey: string; checksum: string }>;
}

export class LocalRemediationArtifactStore implements RemediationArtifactStore {
  private readonly artifactRoot = path.resolve(process.env.SCANNER_ARTIFACT_ROOT ?? ".artifacts");

  async writeJsonArtifact(
    artifactPrefix: string,
    relativePath: string,
    content: unknown
  ): Promise<{ artifactKey: string; checksum: string }> {
    const artifactKey = toPosixPath(path.join(artifactPrefix, relativePath));
    const filePath = resolveWithinRoot(this.artifactRoot, artifactKey);
    const body = `${JSON.stringify(content, null, 2)}\n`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body, "utf8");
    return { artifactKey, checksum: sha256(body) };
  }
}

export function remediationArtifactPrefix(scanId: string, findingId: string): string {
  return toPosixPath(
    path.join(
      "remediations",
      sanitizePathSegment(scanId),
      sanitizePathSegment(findingId),
      `${Date.now()}-${randomBytes(4).toString("hex")}`
    )
  );
}

function resolveWithinRoot(root: string, unsafeRelativePath: string): string {
  const target = path.resolve(root, unsafeRelativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Artifact path escapes configured artifact root");
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
