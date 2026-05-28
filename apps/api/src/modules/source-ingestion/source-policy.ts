import { createHash } from "node:crypto";
import path from "node:path";

export interface SourceFileCandidate {
  path: string;
  content: Buffer;
  declaredChecksum?: string | undefined;
}

export interface SourcePolicyOptions {
  maxFileBytes?: number | undefined;
  maxTotalBytes?: number | undefined;
  maxFiles?: number | undefined;
  include?: string[] | undefined;
  exclude?: string[] | undefined;
}

export interface SourcePolicyAcceptedFile {
  path: string;
  content: Buffer;
  checksum: string;
  sizeBytes: number;
  contentType: string;
}

export interface SourcePolicyRejectedFile {
  path: string;
  reason: string;
  category: string;
}

export interface SourcePolicyIgnoredFile {
  path: string;
  reason: string;
}

export interface SourcePolicyEvaluation {
  status: "ALLOWED" | "PARTIAL" | "REJECTED";
  files: SourcePolicyAcceptedFile[];
  ignored: SourcePolicyIgnoredFile[];
  rejected: SourcePolicyRejectedFile[];
  decisions: Array<{
    status: "ALLOWED" | "REJECTED";
    path: string;
    reason: string;
    category?: string | undefined;
  }>;
  manifest: {
    generatedAt: string;
    fileCount: number;
    totalSizeBytes: number;
    ignoredFileCount: number;
    rejectedFileCount: number;
    files: Array<{
      path: string;
      checksum: string;
      sizeBytes: number;
      contentType: string;
    }>;
    ignored: SourcePolicyIgnoredFile[];
    rejected: SourcePolicyRejectedFile[];
  };
  manifestChecksum: string;
  archiveChecksum: string;
  totalSizeBytes: number;
}

const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5_000;

const DENIED_DIRECTORY_SEGMENTS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  "cache",
  "out",
  "artifacts"
]);

const DENIED_FILE_NAMES = [/^\.env(?:\..*)?$/u, /^private-key.*$/iu, /^seed.*$/iu, /^mnemonic.*$/iu];
const DENIED_EXTENSIONS = new Set([".pem", ".key", ".p12", ".keystore"]);

export function evaluateSourceFiles(
  candidates: SourceFileCandidate[],
  options: SourcePolicyOptions = {}
): SourcePolicyEvaluation {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const normalizedCandidates = candidates
    .map((candidate) => ({ ...candidate, path: normalizeSourcePath(candidate.path) }))
    .filter((candidate): candidate is SourceFileCandidate & { path: string } => Boolean(candidate.path));
  const ignoreRules = buildSourceIgnoreRules(normalizedCandidates, options.exclude ?? []);
  const includeRules = (options.include ?? []).map((rule) => rule.trim()).filter(Boolean);

  const files: SourcePolicyAcceptedFile[] = [];
  const ignored: SourcePolicyIgnoredFile[] = [];
  const rejected: SourcePolicyRejectedFile[] = [];
  const decisions: SourcePolicyEvaluation["decisions"] = [];
  let totalSizeBytes = 0;

  for (const candidate of normalizedCandidates) {
    const ignoredReason = sourceIgnoreReasonForPath(candidate.path, ignoreRules, includeRules);
    if (ignoredReason) {
      ignored.push({ path: candidate.path, reason: ignoredReason });
      continue;
    }

    const sizeBytes = candidate.content.byteLength;
    if (sizeBytes > maxFileBytes) {
      ignored.push({ path: candidate.path, reason: "large_file" });
      continue;
    }
    if (looksBinary(candidate.content)) {
      ignored.push({ path: candidate.path, reason: "binary_file" });
      continue;
    }
    if (files.length + 1 > maxFiles) {
      rejected.push({ path: candidate.path, reason: "file_count_limit", category: "POLICY_LIMIT" });
      decisions.push({ status: "REJECTED", path: candidate.path, reason: "file_count_limit", category: "POLICY_LIMIT" });
      continue;
    }
    if (totalSizeBytes + sizeBytes > maxTotalBytes) {
      rejected.push({ path: candidate.path, reason: "total_size_limit", category: "POLICY_LIMIT" });
      decisions.push({ status: "REJECTED", path: candidate.path, reason: "total_size_limit", category: "POLICY_LIMIT" });
      continue;
    }

    const secret = detectHighRiskSecret(candidate.content);
    if (secret) {
      rejected.push({ path: candidate.path, reason: "secret_detected", category: secret });
      decisions.push({ status: "REJECTED", path: candidate.path, reason: "secret_detected", category: secret });
      continue;
    }

    const checksum = sha256Buffer(candidate.content);
    if (candidate.declaredChecksum && candidate.declaredChecksum !== checksum) {
      rejected.push({ path: candidate.path, reason: "checksum_mismatch", category: "CHECKSUM" });
      decisions.push({ status: "REJECTED", path: candidate.path, reason: "checksum_mismatch", category: "CHECKSUM" });
      continue;
    }

    files.push({
      path: candidate.path,
      content: candidate.content,
      checksum,
      sizeBytes,
      contentType: guessContentType(candidate.path)
    });
    decisions.push({ status: "ALLOWED", path: candidate.path, reason: "policy_allowed" });
    totalSizeBytes += sizeBytes;
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    totalSizeBytes,
    ignoredFileCount: ignored.length,
    rejectedFileCount: rejected.length,
    files: files.map(({ content: _content, ...file }) => file),
    ignored,
    rejected
  };
  const manifestChecksum = sha256String(JSON.stringify(manifest));
  const archiveChecksum = sha256String(JSON.stringify(manifest.files));

  return {
    status: files.length === 0 ? "REJECTED" : rejected.length > 0 || ignored.length > 0 ? "PARTIAL" : "ALLOWED",
    files,
    ignored,
    rejected,
    decisions,
    manifest,
    manifestChecksum,
    archiveChecksum,
    totalSizeBytes
  };
}

export function normalizeSourcePath(input: string): string | null {
  const normalized = input.replace(/\\/gu, "/").replace(/^\/+/u, "");
  if (!normalized || normalized.includes("\0")) return null;
  const clean = path.posix.normalize(normalized);
  if (clean === "." || clean.startsWith("../") || clean === ".." || path.posix.isAbsolute(clean)) {
    return null;
  }
  return clean;
}

export function detectHighRiskSecret(content: Buffer): string | null {
  const text = content.toString("utf8", 0, Math.min(content.byteLength, 512 * 1024));
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/u.test(text)) return "PRIVATE_KEY";
  if (/\bgh[opsru]_[A-Za-z0-9_]{20,}\b/u.test(text)) return "GITHUB_TOKEN";
  if (/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/u.test(text)) return "JWT";
  if (/(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s"'<>]+/iu.test(text)) return "DATABASE_URL";
  if (/https?:\/\/[^\s"'<>]*(?:alchemy|infura|quicknode|rpc)[^\s"'<>]*(?:key|token|api)[^\s"'<>]*/iu.test(text)) return "RPC_URL_WITH_KEY";
  if (/(?:api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{24,}/iu.test(text)) return "API_KEY_LIKE";
  if (/(?:seed|mnemonic)\s*(?:phrase)?\s*[:=]\s*["']?(?:[a-z]{3,12}\s+){11,23}[a-z]{3,12}/iu.test(text)) return "SEED_PHRASE";
  return null;
}

export function sha256Buffer(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function sha256String(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildSourceIgnoreRules(candidates: Array<SourceFileCandidate & { path: string }>, extraRules: string[] = []): string[] {
  const rules = [...extraRules];
  for (const candidate of candidates) {
    if (![".gitignore", ".web3guardignore"].includes(path.posix.basename(candidate.path))) continue;
    const text = candidate.content.toString("utf8", 0, Math.min(candidate.content.byteLength, 128 * 1024));
    for (const line of text.split(/\r?\n/u)) {
      const rule = line.trim();
      if (!rule || rule.startsWith("#") || rule.startsWith("!")) continue;
      rules.push(rule);
    }
  }
  return rules;
}

export function sourceIgnoreReasonForPath(filePath: string, rules: string[], includeRules: string[] = []): string | null {
  if (includeRules.length > 0 && !includeRules.some((rule) => matchIgnoreRule(filePath, rule))) {
    return "not_included";
  }
  const segments = filePath.split("/");
  if (segments.some((segment) => DENIED_DIRECTORY_SEGMENTS.has(segment))) return "default_deny_directory";
  const basename = path.posix.basename(filePath);
  if (DENIED_FILE_NAMES.some((rule) => rule.test(basename))) return "default_deny_secret_filename";
  if (DENIED_EXTENSIONS.has(path.posix.extname(basename).toLowerCase())) return "default_deny_secret_extension";
  if (rules.some((rule) => matchIgnoreRule(filePath, rule))) return "ignore_rule";
  return null;
}

function matchIgnoreRule(filePath: string, rawRule: string): boolean {
  const rule = rawRule.replace(/\\/gu, "/").replace(/^\/+/u, "").trim();
  if (!rule) return false;
  const basename = path.posix.basename(filePath);
  if (rule.endsWith("/")) {
    const directory = rule.replace(/\/+$/u, "");
    return filePath === directory || filePath.startsWith(`${directory}/`) || filePath.split("/").includes(directory);
  }
  if (!rule.includes("/") && !rule.includes("*")) {
    return basename === rule || filePath.split("/").includes(rule);
  }
  if (rule.includes("*")) {
    const expression = `^${escapeRegex(rule).replace(/\\\*\\\*/gu, ".*").replace(/\\\*/gu, "[^/]*")}$`;
    return new RegExp(expression, "u").test(filePath) || new RegExp(expression, "u").test(basename);
  }
  return filePath === rule || filePath.startsWith(`${rule}/`);
}

function looksBinary(content: Buffer): boolean {
  const sample = content.subarray(0, Math.min(content.byteLength, 4096));
  if (sample.includes(0)) return true;
  if (sample.length === 0) return false;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length > 0.3;
}

function guessContentType(relativePath: string): string {
  if (relativePath.endsWith(".json")) return "application/json";
  if (relativePath.endsWith(".md")) return "text/markdown";
  if (relativePath.endsWith(".sol")) return "text/plain";
  if (relativePath.endsWith(".toml")) return "text/plain";
  if (relativePath.endsWith(".yaml") || relativePath.endsWith(".yml")) return "text/yaml";
  if (relativePath.endsWith(".ts") || relativePath.endsWith(".js")) return "text/javascript";
  return "text/plain";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
