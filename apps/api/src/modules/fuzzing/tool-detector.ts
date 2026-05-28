import { spawn } from "node:child_process";
import type { FuzzToolKind } from "@prisma/client";
import { redactSecrets } from "../remediation/redaction.js";

export interface FuzzToolAvailability {
  toolName: "forge" | "echidna" | "medusa" | "hardhat" | "node" | "npm";
  toolKind: FuzzToolKind;
  available: boolean;
  status: "AVAILABLE" | "TOOL_NOT_INSTALLED";
  version: string | null;
  errorCategory: string | null;
}

export interface FuzzToolDetector {
  detect(): Promise<FuzzToolAvailability[]>;
}

const TOOL_COMMANDS: Array<{
  toolName: FuzzToolAvailability["toolName"];
  toolKind: FuzzToolKind;
  command: string;
  args: string[];
}> = [
  { toolName: "forge", toolKind: "FOUNDRY", command: "forge", args: ["--version"] },
  { toolName: "echidna", toolKind: "ECHIDNA", command: "echidna", args: ["--version"] },
  { toolName: "medusa", toolKind: "MEDUSA", command: "medusa", args: ["--version"] },
  { toolName: "hardhat", toolKind: "HARDHAT", command: "hardhat", args: ["--version"] },
  { toolName: "node", toolKind: "UNKNOWN", command: "node", args: ["--version"] },
  { toolName: "npm", toolKind: "UNKNOWN", command: "npm", args: ["--version"] }
];

export class LocalFuzzToolDetector implements FuzzToolDetector {
  async detect(): Promise<FuzzToolAvailability[]> {
    return Promise.all(
      TOOL_COMMANDS.map(async (tool) => {
        const result = await safeVersion(tool.command, tool.args);
        return {
          toolName: tool.toolName,
          toolKind: tool.toolKind,
          available: result.available,
          status: result.available ? "AVAILABLE" : "TOOL_NOT_INSTALLED",
          version: result.version,
          errorCategory: result.available ? null : "TOOL_NOT_INSTALLED"
        };
      })
    );
  }
}

async function safeVersion(command: string, args: string[]): Promise<{ available: boolean; version: string | null }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: safeEnv()
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ available: false, version: null });
    }, 3_000);

    child.stdout.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString("utf8")).slice(0, 2_000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString("utf8")).slice(0, 2_000);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ available: false, version: null });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        available: code === 0,
        version: code === 0 ? redactSecrets(output.trim()).split(/\r?\n/u)[0] ?? null : null
      });
    });
  });
}

function safeEnv(): NodeJS.ProcessEnv {
  const { PATH, Path, SystemRoot, WINDIR } = process.env;
  return { PATH, Path, SystemRoot, WINDIR };
}
