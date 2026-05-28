import { spawn } from "node:child_process";
import { redactSecrets } from "../remediation/redaction.js";

export interface SimulationToolAvailability {
  toolName: "anvil" | "forge" | "hardhat" | "node" | "npm";
  available: boolean;
  status: "AVAILABLE" | "TOOL_NOT_INSTALLED";
  version: string | null;
  errorCategory: string | null;
}

export interface SimulationToolDetector {
  detect(): Promise<SimulationToolAvailability[]>;
}

const TOOL_COMMANDS: Array<{ toolName: SimulationToolAvailability["toolName"]; command: string; args: string[] }> = [
  { toolName: "anvil", command: "anvil", args: ["--version"] },
  { toolName: "forge", command: "forge", args: ["--version"] },
  { toolName: "hardhat", command: "hardhat", args: ["--version"] },
  { toolName: "node", command: "node", args: ["--version"] },
  { toolName: "npm", command: "npm", args: ["--version"] }
];

export class LocalSimulationToolDetector implements SimulationToolDetector {
  async detect(): Promise<SimulationToolAvailability[]> {
    return Promise.all(
      TOOL_COMMANDS.map(async (tool) => {
        const result = await safeVersion(tool.command, tool.args);
        return {
          toolName: tool.toolName,
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
      output += chunk.toString("utf8");
      output = output.slice(0, 2_000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      output = output.slice(0, 2_000);
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
