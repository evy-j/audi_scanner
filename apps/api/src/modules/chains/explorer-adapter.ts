import { createHash } from "node:crypto";

export type ExplorerFetchOutcome =
  | { status: "VERIFIED"; source: ExplorerSource; abi?: unknown[] | null; raw: unknown }
  | { status: "NOT_VERIFIED"; message: string; raw?: unknown }
  | { status: "PROVIDER_NOT_CONFIGURED"; message: string }
  | { status: "RATE_LIMITED"; message: string; raw?: unknown }
  | { status: "FAILED"; message: string; raw?: unknown };

export interface ExplorerSourceFile {
  path: string;
  content: string;
}

export interface ExplorerSource {
  contractName?: string | null;
  compilerVersion?: string | null;
  language: "SOLIDITY" | "VYPER" | "UNKNOWN";
  sourceFiles: ExplorerSourceFile[];
  abiChecksum?: string | null;
  sourceChecksum: string;
  proxyImplementationAddress?: string | null;
}

export interface EtherscanExplorerConfig {
  name: string;
  apiBaseUrl: string;
  apiKeyEnvKey?: string | null;
  networkId?: number | null;
}

export class EtherscanStyleExplorerAdapter {
  async fetchVerifiedSource(config: EtherscanExplorerConfig, address: string, includeAbi: boolean): Promise<ExplorerFetchOutcome> {
    const apiKey = this.resolveApiKey(config);
    if (!apiKey) {
      return { status: "PROVIDER_NOT_CONFIGURED", message: `${config.apiKeyEnvKey ?? "ETHERSCAN_API_KEY"} is not configured` };
    }

    try {
      const sourceJson = await this.request(config, apiKey, { module: "contract", action: "getsourcecode", address });
      if (isRateLimited(sourceJson)) return { status: "RATE_LIMITED", message: "Explorer rate limit reached", raw: safeRaw(sourceJson) };
      const first = Array.isArray(sourceJson?.result) ? sourceJson.result[0] : null;
      const rawSource = typeof first?.SourceCode === "string" ? first.SourceCode : "";
      if (!rawSource.trim()) {
        return { status: "NOT_VERIFIED", message: "Explorer did not return verified source code", raw: safeRaw(sourceJson) };
      }

      const sourceFiles = parseSourceFiles(rawSource, first?.ContractName ?? address);
      if (sourceFiles.length === 0) {
        return { status: "NOT_VERIFIED", message: "Explorer source payload could not be parsed", raw: safeRaw(sourceJson) };
      }

      let abi: unknown[] | null = null;
      let abiChecksum: string | null = null;
      if (includeAbi) {
        const abiJson = await this.request(config, apiKey, { module: "contract", action: "getabi", address });
        if (abiJson?.status === "1" && typeof abiJson.result === "string" && abiJson.result.trim()) {
          try {
            const parsed = JSON.parse(abiJson.result);
            if (Array.isArray(parsed)) {
              abi = parsed;
              abiChecksum = sha256(abiJson.result);
            }
          } catch {
            // Store ABI as unavailable instead of trusting malformed JSON.
          }
        }
      }

      const allContent = sourceFiles.map((file) => `${file.path}\n${file.content}`).join("\n---\n");
      return {
        status: "VERIFIED",
        raw: safeRaw(sourceJson),
        abi,
        source: {
          contractName: first?.ContractName ?? null,
          compilerVersion: first?.CompilerVersion ?? null,
          language: detectLanguage(sourceFiles),
          sourceFiles,
          sourceChecksum: sha256(allContent),
          abiChecksum,
          proxyImplementationAddress: normalizeOptionalAddress(first?.Implementation ?? first?.Proxy ?? null)
        }
      };
    } catch (error) {
      return { status: "FAILED", message: error instanceof Error ? error.message : "Explorer fetch failed" };
    }
  }

  buildAddressUrl(baseUrl: string, address: string) {
    return `${baseUrl.replace(/\/+$/u, "")}/address/${address}`;
  }

  buildTxUrl(baseUrl: string, txHash: string) {
    return `${baseUrl.replace(/\/+$/u, "")}/tx/${txHash}`;
  }

  private resolveApiKey(config: EtherscanExplorerConfig): string | null {
    const specific = config.apiKeyEnvKey ? process.env[config.apiKeyEnvKey] : undefined;
    return specific || process.env.ETHERSCAN_API_KEY || null;
  }

  private async request(config: EtherscanExplorerConfig, apiKey: string, params: Record<string, string>): Promise<any> {
    const url = new URL(config.apiBaseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("apikey", apiKey);
    if (config.networkId && shouldUseV2(url)) {
      url.searchParams.set("chainid", String(config.networkId));
    }
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "Web3Guard" } });
    if (response.status === 429) return { status: "0", message: "RATE_LIMIT", result: "rate limited" };
    if (!response.ok) throw new Error(`Explorer API returned HTTP ${response.status}`);
    return response.json();
  }
}

function shouldUseV2(url: URL): boolean {
  return url.pathname.includes("/v2/") || url.hostname.includes("etherscan.io");
}

function parseSourceFiles(raw: string, contractName: string): ExplorerSourceFile[] {
  const trimmed = raw.trim();
  const fallbackName = sanitizePath(`${contractName || "Contract"}.sol`);
  const candidates = [trimmed];
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) candidates.unshift(trimmed.slice(1, -1));
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) candidates.push(trimmed);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const sources = parsed?.sources;
      if (sources && typeof sources === "object") {
        const files: ExplorerSourceFile[] = [];
        for (const [filePath, value] of Object.entries(sources)) {
          const content = typeof (value as any)?.content === "string" ? (value as any).content : typeof value === "string" ? value : null;
          if (content) files.push({ path: sanitizePath(filePath), content });
        }
        if (files.length > 0) return files;
      }
      if (typeof parsed?.SourceCode === "string") return [{ path: fallbackName, content: parsed.SourceCode }];
    } catch {
      // Try next format.
    }
  }

  return trimmed ? [{ path: fallbackName, content: raw }] : [];
}

function sanitizePath(input: string): string {
  const normalized = input.replace(/\\/gu, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\0")) return "Contract.sol";
  return normalized;
}

function detectLanguage(files: ExplorerSourceFile[]): "SOLIDITY" | "VYPER" | "UNKNOWN" {
  if (files.some((file) => file.path.endsWith(".vy"))) return "VYPER";
  if (files.some((file) => file.path.endsWith(".sol"))) return "SOLIDITY";
  return "UNKNOWN";
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRateLimited(payload: any): boolean {
  const text = JSON.stringify(payload ?? {}).toLowerCase();
  return text.includes("rate limit") || text.includes("max rate") || text.includes("too many requests");
}

function safeRaw(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  return JSON.parse(JSON.stringify(payload, (key, value) => key.toLowerCase().includes("apikey") ? "[REDACTED]" : value));
}

function normalizeOptionalAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : null;
}
