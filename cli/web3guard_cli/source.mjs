import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_DENY_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", "coverage", "cache", "out", "artifacts"]);
const DEFAULT_MAX_SIZE_MB = 25;

export async function buildSourceBundle(rootPath, options = {}) {
  const root = path.resolve(rootPath);
  const maxSizeBytes = Number(options.maxSizeMb ?? DEFAULT_MAX_SIZE_MB) * 1024 * 1024;
  const include = arrayOption(options.include);
  const exclude = arrayOption(options.exclude);
  const rootIgnoreRules = await loadIgnoreRules(root, exclude);
  const files = [];
  const ignored = [];
  const rejected = [];
  let totalSizeBytes = 0;

  await walk(root, async (absolutePath, relativePath, dirent) => {
    const normalized = toPosix(relativePath);
    if (dirent.isDirectory()) {
      const reason = ignoreDirectoryReason(normalized, rootIgnoreRules, include);
      if (reason) {
        ignored.push({ path: normalized, reason });
        return "skip";
      }
      return undefined;
    }
    if (!dirent.isFile()) return undefined;

    const ignoredReason = ignoreFileReason(normalized, rootIgnoreRules, include);
    if (ignoredReason) {
      ignored.push({ path: normalized, reason: ignoredReason });
      return undefined;
    }
    const stat = await fs.stat(absolutePath);
    if (stat.size > 2 * 1024 * 1024) {
      ignored.push({ path: normalized, reason: "large_file" });
      return undefined;
    }
    if (totalSizeBytes + stat.size > maxSizeBytes) {
      rejected.push({ path: normalized, reason: "total_size_limit", category: "POLICY_LIMIT" });
      return undefined;
    }
    const content = await fs.readFile(absolutePath);
    if (looksBinary(content)) {
      ignored.push({ path: normalized, reason: "binary_file" });
      return undefined;
    }
    const secret = detectHighRiskSecret(content);
    if (secret) {
      rejected.push({ path: normalized, reason: "secret_detected", category: secret });
      return undefined;
    }
    const checksum = sha256(content);
    files.push({
      path: normalized,
      checksum,
      contentBase64: content.toString("base64")
    });
    totalSizeBytes += stat.size;
    return undefined;
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    rootHash: sha256(Buffer.from(root)),
    fileCount: files.length,
    totalSizeBytes,
    ignoredFileCount: ignored.length,
    rejectedFileCount: rejected.length,
    files: files.map(({ contentBase64: _contentBase64, ...file }) => file),
    ignored,
    rejected
  };

  return {
    ok: files.length > 0,
    root,
    files,
    manifest,
    ignored,
    rejected,
    policyStatus: files.length === 0 ? "REJECTED" : rejected.length > 0 || ignored.length > 0 ? "PARTIAL" : "ALLOWED",
    pathHash: sha256(Buffer.from(root))
  };
}

async function walk(root, visitor, current = root) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute);
    const result = await visitor(absolute, relative, entry);
    if (entry.isDirectory() && result !== "skip") {
      await walk(root, visitor, absolute);
    }
  }
}

async function loadIgnoreRules(root, extraRules) {
  const rules = [...extraRules];
  for (const filename of [".gitignore", ".web3guardignore"]) {
    const filePath = path.join(root, filename);
    const text = await fs.readFile(filePath, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return "";
      throw error;
    });
    for (const line of text.split(/\r?\n/u)) {
      const rule = line.trim();
      if (!rule || rule.startsWith("#") || rule.startsWith("!")) continue;
      rules.push(rule);
    }
  }
  return rules;
}

function ignoreDirectoryReason(relativePath, rules, include) {
  const name = path.posix.basename(relativePath);
  if (DEFAULT_DENY_DIRS.has(name)) return "default_deny_directory";
  if (relativePath && include.length > 0 && !include.some((rule) => matchRule(relativePath, rule))) return "not_included";
  if (rules.some((rule) => matchRule(relativePath, rule) || matchRule(`${relativePath}/`, rule))) return "ignore_rule";
  return null;
}

function ignoreFileReason(relativePath, rules, include) {
  const name = path.posix.basename(relativePath);
  const ext = path.posix.extname(name).toLowerCase();
  if (include.length > 0 && !include.some((rule) => matchRule(relativePath, rule))) return "not_included";
  if (/^\.env(?:\..*)?$/u.test(name)) return "default_deny_secret_filename";
  if (/^(?:private-key|seed|mnemonic).*$/iu.test(name)) return "default_deny_secret_filename";
  if ([".pem", ".key", ".p12", ".keystore"].includes(ext)) return "default_deny_secret_extension";
  if (relativePath.split("/").some((segment) => DEFAULT_DENY_DIRS.has(segment))) return "default_deny_directory";
  if (rules.some((rule) => matchRule(relativePath, rule))) return "ignore_rule";
  return null;
}

function matchRule(relativePath, rawRule) {
  const rule = String(rawRule).replace(/\\/gu, "/").replace(/^\/+/u, "").trim();
  if (!rule) return false;
  const basename = path.posix.basename(relativePath);
  if (rule.endsWith("/")) {
    const directory = rule.replace(/\/+$/u, "");
    return relativePath === directory || relativePath.startsWith(`${directory}/`) || relativePath.split("/").includes(directory);
  }
  if (!rule.includes("/") && !rule.includes("*")) {
    return basename === rule || relativePath.split("/").includes(rule);
  }
  if (rule.includes("*")) {
    const expression = `^${escapeRegex(rule).replace(/\\\*\\\*/gu, ".*").replace(/\\\*/gu, "[^/]*")}$`;
    const regex = new RegExp(expression, "u");
    return regex.test(relativePath) || regex.test(basename);
  }
  return relativePath === rule || relativePath.startsWith(`${rule}/`);
}

function detectHighRiskSecret(content) {
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

function looksBinary(content) {
  const sample = content.subarray(0, Math.min(content.byteLength, 4096));
  if (sample.includes(0)) return true;
  if (sample.length === 0) return false;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length > 0.3;
}

function arrayOption(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function toPosix(value) {
  return value.replace(/\\/gu, "/");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
