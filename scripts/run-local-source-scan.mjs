import { promises as fs } from "node:fs";
import path from "node:path";

const API_BASE_URL = process.env.LOCAL_SCAN_API_URL ?? "http://localhost:4000/api/v1";
const EMAIL = process.env.LOCAL_SCAN_EMAIL ?? "dev@audit-scanner.local";
const PASSWORD = process.env.LOCAL_SCAN_PASSWORD ?? "Development123!";
const ORG_SLUG = process.env.LOCAL_SCAN_ORG_SLUG ?? "development-labs";
const SOURCE_DIR = path.resolve(process.env.LOCAL_SCAN_SOURCE_DIR ?? "examples/local-scan");
const ARTIFACT_ROOT = path.resolve(process.env.LOCAL_SCAN_ARTIFACT_ROOT ?? ".artifacts");
const ARTIFACT_KEY = normalizeArtifactKey(
  process.env.LOCAL_SCAN_ARTIFACT_KEY ?? "source-fixtures/local-scan"
);
const ANALYZERS = parseCsv(process.env.LOCAL_SCAN_ANALYZERS ?? "semgrep");

if (ANALYZERS.length === 0) {
  throw new Error("LOCAL_SCAN_ANALYZERS must include at least one analyzer");
}

const artifactDestination = path.resolve(ARTIFACT_ROOT, ARTIFACT_KEY);
const artifactRelative = path.relative(ARTIFACT_ROOT, artifactDestination);
if (artifactRelative.startsWith("..") || path.isAbsolute(artifactRelative)) {
  throw new Error(`LOCAL_SCAN_ARTIFACT_KEY escapes artifact root: ${ARTIFACT_KEY}`);
}

await fs.rm(artifactDestination, { recursive: true, force: true });
await fs.mkdir(path.dirname(artifactDestination), { recursive: true });
await fs.cp(SOURCE_DIR, artifactDestination, {
  recursive: true,
  force: true,
  filter: (source) => !isIgnoredPath(source)
});

const login = await request("/auth/login", {
  method: "POST",
  body: {
    email: EMAIL,
    password: PASSWORD
  }
});

const organizations = await request("/organizations", {
  token: login.accessToken
});
const organization =
  organizations.find((candidate) => candidate.slug === ORG_SLUG) ?? organizations[0];

if (!organization) {
  throw new Error(`No organization was found for ${EMAIL}`);
}

const scan = await request("/scans", {
  method: "POST",
  token: login.accessToken,
  body: {
    organizationId: organization.id,
    title: "Local source fixture scan",
    priority: "NORMAL",
    target: {
      type: "SOURCE",
      artifactKey: ARTIFACT_KEY
    },
    analyzers: ANALYZERS
  }
});

console.log(
  JSON.stringify(
    {
      queued: true,
      scanId: scan.id,
      organizationId: organization.id,
      artifactKey: ARTIFACT_KEY,
      analyzers: ANALYZERS,
      api: {
        scan: `${API_BASE_URL}/scans/${scan.id}?organizationId=${organization.id}`,
        list: `${API_BASE_URL}/scans?organizationId=${organization.id}`
      }
    },
    null,
    2
  )
);

async function request(route, options = {}) {
  const headers = {
    accept: "application/json",
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
  };
  const response = await fetch(`${API_BASE_URL}${route}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}: ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

function parseCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeArtifactKey(value) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").includes("..")) {
    throw new Error(`Invalid artifact key: ${value}`);
  }
  return normalized;
}

function isIgnoredPath(source) {
  const ignored = new Set([".git", "node_modules", "cache", "out", "artifacts", "broadcast"]);
  return !source
    .split(path.sep)
    .some((segment) => ignored.has(segment));
}
