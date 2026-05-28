import { createHash, createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/environment.js";

export interface StoredSourceFile {
  path: string;
  content: Buffer;
  contentType: string;
}

export interface SourceArtifactStore {
  readonly driver: "local" | "s3";
  writeSourceDirectory(prefix: string, files: StoredSourceFile[], manifest: unknown): Promise<void>;
  readText(key: string): Promise<string | null>;
}

export function createSourceArtifactStore(): SourceArtifactStore {
  if (env.STORAGE_DRIVER === "s3" || env.STORAGE_DRIVER === "r2") {
    return new S3SourceArtifactStore({
      endpoint: env.S3_ENDPOINT!,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET!,
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      prefix: env.S3_PREFIX
    });
  }

  return new LocalSourceArtifactStore(path.resolve(env.LOCAL_ARTIFACT_DIR));
}

class LocalSourceArtifactStore implements SourceArtifactStore {
  readonly driver = "local" as const;

  constructor(private readonly root: string) {}

  async writeSourceDirectory(prefix: string, files: StoredSourceFile[], manifest: unknown): Promise<void> {
    const sourceRoot = resolveWithinRoot(this.root, prefix);
    await fs.rm(sourceRoot, { recursive: true, force: true });
    await fs.mkdir(sourceRoot, { recursive: true });
    for (const file of files) {
      const destination = resolveWithinRoot(sourceRoot, file.path);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, file.content);
    }
    const manifestPath = resolveWithinRoot(this.root, path.posix.join(prefix, "..", "manifest.json"));
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  async readText(key: string): Promise<string | null> {
    try {
      return await fs.readFile(resolveWithinRoot(this.root, key), "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    }
  }
}

interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

class S3SourceArtifactStore implements SourceArtifactStore {
  readonly driver = "s3" as const;
  private readonly endpoint: URL;

  constructor(private readonly config: S3Config) {
    this.endpoint = new URL(config.endpoint);
  }

  async writeSourceDirectory(prefix: string, files: StoredSourceFile[], manifest: unknown): Promise<void> {
    await Promise.all([
      ...files.map((file) =>
        this.put(path.posix.join(prefix, file.path), file.content, file.contentType)
      ),
      this.put(path.posix.join(prefix, "..", "manifest.json"), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"), "application/json")
    ]);
  }

  async readText(key: string): Promise<string | null> {
    const response = await this.request("GET", key);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Artifact read failed: ${response.status}`);
    return response.text();
  }

  private async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const response = await this.request("PUT", key, {
      body,
      headers: {
        "content-type": contentType,
        "x-amz-meta-sha256": sha256Buffer(body)
      }
    });
    if (!response.ok) throw new Error(`Artifact write failed: ${response.status}`);
  }

  private request(
    method: "GET" | "PUT",
    artifactKey: string,
    options: { body?: Buffer | undefined; headers?: Record<string, string> | undefined } = {}
  ): Promise<Response> {
    const body = options.body ?? Buffer.alloc(0);
    const url = this.buildUrl(artifactKey);
    const headers = this.sign(method, url, sha256Buffer(body), options.headers ?? {});
    const init: RequestInit = { method, headers };
    if (method === "PUT") init.body = body as unknown as BodyInit;
    return fetch(url, init);
  }

  private buildUrl(artifactKey: string): URL {
    const url = new URL(this.endpoint.toString());
    const fullKey = toPosixPath(path.posix.join(this.config.prefix, artifactKey)).replace(/^\/+/u, "");
    url.pathname = joinUrlPath(url.pathname, this.config.bucket, fullKey);
    return url;
  }

  private sign(method: string, url: URL, payloadHash: string, inputHeaders: Record<string, string>) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/gu, "");
    const dateStamp = amzDate.slice(0, 8);
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...Object.fromEntries(Object.entries(inputHeaders).map(([key, value]) => [key.toLowerCase(), value]))
    };
    const signedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderKeys.map((key) => `${key}:${headers[key]!.trim()}\n`).join("");
    const signedHeaders = signedHeaderKeys.join(";");
    const canonicalRequest = [method, normalizeCanonicalPath(url.pathname), "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
    const signature = createHmac("sha256", getSignatureKey(this.config.secretAccessKey, dateStamp, this.config.region, "s3"))
      .update(stringToSign)
      .digest("hex");
    headers.authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`
    ].join(", ");
    return headers;
  }
}

function resolveWithinRoot(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root);
  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error("Artifact path escaped storage root");
  }
  return resolved;
}

function sha256Buffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function toPosixPath(value: string): string {
  return value.replace(/\\/gu, "/");
}

function joinUrlPath(...segments: string[]): string {
  return `/${segments.flatMap((segment) => segment.split("/")).filter(Boolean).map(encodeURIComponent).join("/")}`;
}

function normalizeCanonicalPath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)).replace(/[!'()*]/gu, (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}

function getSignatureKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const dateKey = createHmac("sha256", `AWS4${secret}`).update(dateStamp).digest();
  const regionKey = createHmac("sha256", dateKey).update(region).digest();
  const serviceKey = createHmac("sha256", regionKey).update(service).digest();
  return createHmac("sha256", serviceKey).update("aws4_request").digest();
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
