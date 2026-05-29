import { Buffer } from "node:buffer";
import dns from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
import { ApiError } from "../../common/errors/api-error.js";
import { ScansService } from "../scans/scans.service.js";
import { SourceIngestionService } from "../source-ingestion/source-ingestion.service.js";
import type { SourceActor } from "../source-ingestion/source-ingestion.repository.js";
import type { PassiveWebsiteScanInput, SimplePublicRepositoryScanInput, SimpleSourceUploadScanInput } from "./simple-scans.schemas.js";

const SUPPORTED_REPO_FILE_EXTENSIONS = new Set([
  ".sol", ".vy", ".yul", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".cs", ".php", ".rb", ".json", ".yml", ".yaml",
  ".toml", ".lock", ".md", ".env.example"
]);
const SUPPORTED_REPO_FILE_NAMES = new Set([
  "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "foundry.toml", "hardhat.config.ts", "hardhat.config.js", "slither.config.json", ".semgrep.yml", ".web3guardignore"
]);

export class SimpleScansService {
  constructor(
    private readonly sourceIngestion = new SourceIngestionService(),
    private readonly scans = new ScansService()
  ) {}

  async sourceUploadScan(actor: SourceActor, input: SimpleSourceUploadScanInput) {
    const requestedBy = actor.actorUserId;
    if (!requestedBy) {
      throw ApiError.accessDenied("A user-backed session is required for the simple upload scan flow. API keys can still use the advanced source-ingestion endpoint.");
    }

    const upload = await this.sourceIngestion.uploadSourceArtifact(actor, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      originKind: "MANUAL_UPLOAD",
      repoFullName: input.repoFullName,
      branch: input.branch,
      commitSha: input.commitSha,
      files: input.files,
      maxFileBytes: 10 * 1024 * 1024,
      maxTotalBytes: 100 * 1024 * 1024
    });

    if (!isStoredArtifact(upload)) {
      return {
        ...upload,
        realityNotes: [
          "Source artifact was not stored, so no scan was queued.",
          "No finding was fabricated. Fix the source-policy rejection and retry."
        ]
      };
    }

    const scan = await this.scans.create({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceArtifactId: upload.artifact.id,
      title: input.title,
      priority: input.priority,
      target: {
        type: "SOURCE",
        artifactKey: upload.artifact.storageKey
      },
      analyzers: input.analyzers
    }, requestedBy);

    return {
      status: "QUEUED",
      scan,
      sourceArtifact: upload.artifact,
      manifest: upload.manifest,
      runId: upload.runId,
      realityNotes: [
        "Scan was queued from a real stored source artifact.",
        "Analyzers run only if their real container/tool is configured. Missing tools are reported as Tool Not Installed / Not Assessed."
      ]
    };
  }

  async publicRepositoryScan(actor: SourceActor, input: SimplePublicRepositoryScanInput) {
    const requestedBy = actor.actorUserId;
    if (!requestedBy) {
      throw ApiError.accessDenied("A user-backed session is required for public repository URL scans.");
    }

    const repository = parseGitHubRepositoryUrl(input.repositoryUrl);
    const fetched = await fetchPublicGitHubFiles(repository, {
      branch: input.branch,
      maxFiles: input.maxFiles,
      maxTotalBytes: input.maxTotalBytes
    });

    return this.sourceUploadScan(actor, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      title: input.title ?? `Repository scan ${repository.owner}/${repository.repo}`,
      priority: input.priority,
      analyzers: input.analyzers,
      repoFullName: `${repository.owner}/${repository.repo}`,
      branch: fetched.branch,
      commitSha: fetched.commitSha,
      sourceLabel: "public-github-url",
      files: fetched.files.map((file) => ({
        path: file.path,
        contentBase64: file.content.toString("base64")
      }))
    });
  }

  async passiveWebsiteScan(input: PassiveWebsiteScanInput) {
    const target = normalizePublicUrl(input.url);
    await assertPublicHostname(target);
    const startedAt = new Date();
    const response = await fetchHeaders(target);
    const checks = buildWebsiteChecks(response);
    const tlsSummary = target.protocol === "https:" ? await probeTls(target).catch((error: unknown) => ({
      assessed: false,
      error: error instanceof Error ? error.message : String(error)
    })) : { assessed: false, error: "TLS is not used because the URL is not HTTPS." };
    const summary = summarizeChecks(checks);

    return {
      status: "completed" as const,
      targetUrl: target.toString(),
      scannedAt: startedAt.toISOString(),
      summary,
      checks,
      response,
      tls: tlsSummary,
      realityNotes: [
        "This is a passive HTTP/TLS/header scan only.",
        "No brute force, exploit execution, credential attack, DoS, file write, wallet signing, or private-key collection is performed.",
        "For source-code vulnerability detection, run a GitHub/source scan with Semgrep/Slither/Aderyn/Foundry."
      ]
    };
  }
}

function isStoredArtifact(value: unknown): value is { status: "STORED"; artifact: { id: string; storageKey: string }; manifest: unknown; runId: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as { status?: unknown }).status === "STORED" &&
    (value as { artifact?: { id?: unknown; storageKey?: unknown } }).artifact?.id &&
    typeof (value as { artifact: { storageKey?: unknown } }).artifact.storageKey === "string"
  );
}

function parseGitHubRepositoryUrl(value: string): { owner: string; repo: string } {
  const url = new URL(value);
  if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
    throw ApiError.badRequest("Only public GitHub repository URLs are supported in simple repository scan mode.");
  }
  const [owner, repoWithSuffix] = url.pathname.split("/").filter(Boolean);
  const repo = repoWithSuffix?.replace(/\.git$/iu, "");
  if (!owner || !repo) {
    throw ApiError.badRequest("Repository URL must look like https://github.com/owner/repo");
  }
  return { owner, repo };
}

async function fetchPublicGitHubFiles(repo: { owner: string; repo: string }, options: { branch?: string; maxFiles: number; maxTotalBytes: number }) {
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "Web3Guard-Audit-Scanner"
  };
  const repoMeta = await githubJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, headers);
  const branch = options.branch ?? String(repoMeta.default_branch ?? "main");
  const ref = await githubJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/git/ref/heads/${encodeURIComponent(branch)}`, headers);
  const commitSha = String(ref?.object?.sha ?? branch);
  const tree = await githubJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`, headers);
  if (tree.truncated) {
    throw ApiError.conflict("GitHub tree is truncated. Use GitHub App integration or upload a source folder for large repositories.");
  }
  const entries = Array.isArray(tree.tree) ? tree.tree : [];
  const candidates = entries
    .filter((entry: any) => entry?.type === "blob" && typeof entry.path === "string" && typeof entry.sha === "string")
    .filter((entry: any) => isSupportedRepoPath(entry.path))
    .filter((entry: any) => Number(entry.size ?? 0) <= 2 * 1024 * 1024)
    .slice(0, options.maxFiles);

  const files: Array<{ path: string; content: Buffer }> = [];
  let totalBytes = 0;
  for (const entry of candidates) {
    const blob = await githubJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/git/blobs/${entry.sha}`, headers);
    if (blob.encoding !== "base64" || typeof blob.content !== "string") continue;
    const content = Buffer.from(blob.content.replace(/\s+/gu, ""), "base64");
    totalBytes += content.byteLength;
    if (totalBytes > options.maxTotalBytes) break;
    files.push({ path: entry.path, content });
  }

  if (files.length === 0) {
    throw ApiError.conflict("No supported source files were fetched from the public GitHub repository.");
  }

  return { branch, commitSha, files };
}

async function githubJson(url: string, headers: Record<string, string>): Promise<any> {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw ApiError.badRequest(`GitHub API returned ${response.status}. Public repo scan only supports accessible public repositories.`);
  }
  return response.json();
}

function isSupportedRepoPath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (lower.includes("/node_modules/") || lower.includes("/.git/") || lower.includes("/dist/") || lower.includes("/build/")) return false;
  const base = lower.split("/").at(-1) ?? lower;
  if (SUPPORTED_REPO_FILE_NAMES.has(base)) return true;
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot) : "";
  return SUPPORTED_REPO_FILE_EXTENSIONS.has(ext);
}

function normalizePublicUrl(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw ApiError.badRequest("Only http:// and https:// URLs can be passively scanned.");
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  return url;
}

async function assertPublicHostname(url: URL): Promise<void> {
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())) {
    throw ApiError.badRequest("Local/private hosts are not allowed in passive website scans.");
  }
  const records = await dns.lookup(url.hostname, { all: true, verbatim: false });
  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw ApiError.badRequest("Passive website scans only allow public IP targets.");
  }
}

function isPrivateIp(address: string): boolean {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map(Number);
    return parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 127 ||
      parts[0] === 0 ||
      parts[0] >= 224 ||
      (parts[0] === 169 && parts[1] === 254);
  }
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

async function fetchHeaders(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "manual", signal: controller.signal });
    return {
      status: response.status,
      finalUrl: response.url || url.toString(),
      headers: headersToRecord(response.headers)
    };
  } catch {
    const response = await fetch(url, { method: "GET", redirect: "manual", signal: controller.signal });
    return {
      status: response.status,
      finalUrl: response.url || url.toString(),
      headers: headersToRecord(response.headers)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key.toLowerCase()] = value;
  });
  return output;
}

function buildWebsiteChecks(response: { status: number; finalUrl: string; headers: Record<string, string> }) {
  const h = (name: string) => response.headers[name.toLowerCase()];
  const checks = [
    check("hsts", "Strict-Transport-Security", Boolean(h("strict-transport-security")), h("strict-transport-security") ?? "missing", "Add HSTS on HTTPS responses after validating subdomain readiness."),
    check("csp", "Content-Security-Policy", Boolean(h("content-security-policy")), h("content-security-policy") ?? "missing", "Add a restrictive CSP with script-src, object-src, base-uri, and frame-ancestors."),
    check("x-frame", "Clickjacking protection", Boolean(h("x-frame-options")) || /frame-ancestors/iu.test(h("content-security-policy") ?? ""), h("x-frame-options") ?? h("content-security-policy") ?? "missing", "Use frame-ancestors in CSP or X-Frame-Options."),
    check("nosniff", "X-Content-Type-Options", /nosniff/iu.test(h("x-content-type-options") ?? ""), h("x-content-type-options") ?? "missing", "Set X-Content-Type-Options: nosniff."),
    check("referrer", "Referrer-Policy", Boolean(h("referrer-policy")), h("referrer-policy") ?? "missing", "Set Referrer-Policy to strict-origin-when-cross-origin or no-referrer."),
    check("permissions", "Permissions-Policy", Boolean(h("permissions-policy")), h("permissions-policy") ?? "missing", "Restrict camera, microphone, geolocation, payment, and other browser capabilities."),
    check("cors", "CORS wildcard", !/\*/u.test(h("access-control-allow-origin") ?? ""), h("access-control-allow-origin") ?? "not present", "Avoid wildcard CORS on authenticated APIs."),
    check("server", "Server header exposure", !h("server"), h("server") ?? "not present", "Hide or minimize server technology disclosure where possible.")
  ];
  return checks;
}

function check(id: string, title: string, passed: boolean, evidence: string, remediation: string) {
  return {
    id,
    title,
    status: passed ? "pass" as const : "warn" as const,
    evidence,
    remediation: passed ? undefined : remediation
  };
}

function summarizeChecks(checks: Array<{ status: string }>) {
  const passed = checks.filter((item) => item.status === "pass").length;
  const warnings = checks.filter((item) => item.status === "warn").length;
  const failed = checks.filter((item) => item.status === "fail").length;
  const score = Math.round((passed / Math.max(checks.length, 1)) * 100);
  return { score, passed, warnings, failed };
}

async function probeTls(url: URL): Promise<{ assessed: boolean; protocol?: string; validTo?: string; issuer?: string; subject?: string }> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: url.hostname, port: 443, servername: url.hostname, timeout: 8_000 }, () => {
      const cert = socket.getPeerCertificate();
      resolve({
        assessed: true,
        protocol: socket.getProtocol() ?? undefined,
        validTo: cert.valid_to,
        issuer: cert.issuer ? Object.values(cert.issuer).join(" ") : undefined,
        subject: cert.subject ? Object.values(cert.subject).join(" ") : undefined
      });
      socket.end();
    });
    socket.once("error", reject);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("TLS probe timed out"));
    });
  });
}
