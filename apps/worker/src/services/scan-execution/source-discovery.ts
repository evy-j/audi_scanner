import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/environment.js";
import { toPosixPath } from "./safe-path.js";

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

export interface SourceDiscoveryResult {
  workspaceRelativeTarget: string;
  containerTarget: string;
  solidityFiles: string[];
}

export async function discoverSourceTarget(workspaceHostPath: string): Promise<SourceDiscoveryResult> {
  const solidityFiles = await collectSolidityFiles(workspaceHostPath);
  const workspaceRelativeTarget = choosePrimaryTarget(solidityFiles);
  const containerTarget =
    workspaceRelativeTarget === "."
      ? env.SCANNER_WORKSPACE_MOUNT_PATH
      : `${env.SCANNER_WORKSPACE_MOUNT_PATH}/${toPosixPath(workspaceRelativeTarget)}`;

  return {
    workspaceRelativeTarget,
    containerTarget,
    solidityFiles
  };
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
        files.push(toPosixPath(path.relative(root, entryPath)));
      }
    }
  }

  await walk(root);
  return files.sort();
}

function choosePrimaryTarget(solidityFiles: string[]): string {
  if (solidityFiles.length === 0) {
    return ".";
  }

  const preferred = solidityFiles.find((file) => file.startsWith("contracts/"));
  return preferred ?? solidityFiles[0] ?? ".";
}
