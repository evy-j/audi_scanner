import { createHash, createHmac } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/environment.js";
import { sha256Buffer, sha256File } from "../scan-execution/hash.js";
import { resolveWithinRoot, toPosixPath } from "../scan-execution/safe-path.js";

export interface ArtifactMetadata {
  artifactKey: string;
  sizeBytes: number;
  sha256?: string | undefined;
  contentType?: string | undefined;
}

export interface DurableArtifactStore {
  readonly driver: "local" | "s3";
  writeText(artifactKey: string, content: string, contentType?: string): Promise<ArtifactMetadata>;
  writeBuffer(artifactKey: string, content: Buffer, contentType?: string): Promise<ArtifactMetadata>;
  readText(artifactKey: string): Promise<string | null>;
  readBuffer(artifactKey: string): Promise<Buffer | null>;
  head(artifactKey: string): Promise<ArtifactMetadata | null>;
  materialize(artifactKeyOrPrefix: string, destinationPath: string): Promise<void>;
  uploadDirectory(prefix: string, directoryPath: string): Promise<void>;
}

export function createDurableArtifactStore(): DurableArtifactStore {
  if (env.ARTIFACT_STORE_DRIVER === "s3") {
    return new S3CompatibleArtifactStore({
      endpoint: env.ARTIFACT_S3_ENDPOINT!,
      region: env.ARTIFACT_S3_REGION,
      bucket: env.ARTIFACT_S3_BUCKET!,
      accessKeyId: env.ARTIFACT_S3_ACCESS_KEY_ID!,
      secretAccessKey: env.ARTIFACT_S3_SECRET_ACCESS_KEY!,
      sessionToken: env.ARTIFACT_S3_SESSION_TOKEN,
      prefix: env.ARTIFACT_S3_PREFIX,
      forcePathStyle: env.ARTIFACT_S3_FORCE_PATH_STYLE
    });
  }

  return new LocalDurableArtifactStore(path.resolve(env.SCANNER_ARTIFACT_ROOT));
}

class LocalDurableArtifactStore implements DurableArtifactStore {
  readonly driver = "local" as const;

  constructor(private readonly root: string) {}

  async writeText(
    artifactKey: string,
    content: string,
    contentType = "text/plain"
  ): Promise<ArtifactMetadata> {
    return this.writeBuffer(artifactKey, Buffer.from(content, "utf8"), contentType);
  }

  async writeBuffer(
    artifactKey: string,
    content: Buffer,
    contentType = "application/octet-stream"
  ): Promise<ArtifactMetadata> {
    const filePath = resolveWithinRoot(this.root, artifactKey);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);

    return {
      artifactKey,
      sizeBytes: content.byteLength,
      sha256: sha256Buffer(content),
      contentType
    };
  }

  async readText(artifactKey: string): Promise<string | null> {
    const buffer = await this.readBuffer(artifactKey);
    return buffer?.toString("utf8") ?? null;
  }

  async readBuffer(artifactKey: string): Promise<Buffer | null> {
    const filePath = resolveWithinRoot(this.root, artifactKey);
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async head(artifactKey: string): Promise<ArtifactMetadata | null> {
    const filePath = resolveWithinRoot(this.root, artifactKey);
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        return null;
      }

      return {
        artifactKey,
        sizeBytes: stats.size,
        sha256: await sha256File(filePath),
        contentType: guessContentType(artifactKey)
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async materialize(artifactKeyOrPrefix: string, destinationPath: string): Promise<void> {
    const sourcePath = resolveWithinRoot(this.root, artifactKeyOrPrefix);
    const stats = await fs.stat(sourcePath);
    await fs.rm(destinationPath, { recursive: true, force: true });
    await fs.mkdir(destinationPath, { recursive: true });

    if (stats.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
      return;
    }

    if (stats.isFile()) {
      await fs.copyFile(sourcePath, path.join(destinationPath, path.basename(sourcePath)));
      return;
    }

    throw new Error(`Artifact must be a file or directory: ${artifactKeyOrPrefix}`);
  }

  async uploadDirectory(prefix: string, directoryPath: string): Promise<void> {
    const files = await collectFiles(directoryPath);
    await Promise.all(
      files.map(async (filePath) => {
        const relative = toPosixPath(path.relative(directoryPath, filePath));
        await this.writeBuffer(toPosixPath(path.join(prefix, relative)), await fs.readFile(filePath), guessContentType(relative));
      })
    );
  }
}

interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | undefined;
  prefix: string;
  forcePathStyle: boolean;
}

class S3CompatibleArtifactStore implements DurableArtifactStore {
  readonly driver = "s3" as const;
  private readonly endpoint: URL;

  constructor(private readonly config: S3Config) {
    this.endpoint = new URL(config.endpoint);
  }

  async writeText(
    artifactKey: string,
    content: string,
    contentType = "text/plain"
  ): Promise<ArtifactMetadata> {
    return this.writeBuffer(artifactKey, Buffer.from(content, "utf8"), contentType);
  }

  async writeBuffer(
    artifactKey: string,
    content: Buffer,
    contentType = "application/octet-stream"
  ): Promise<ArtifactMetadata> {
    const checksum = sha256Buffer(content);
    const response = await this.request("PUT", artifactKey, {
      body: content,
      headers: {
        "content-type": contentType,
        "x-amz-meta-sha256": checksum
      }
    });

    if (!response.ok) {
      throw new Error(`S3 artifact upload failed for ${artifactKey}: ${response.status} ${await response.text()}`);
    }

    return {
      artifactKey,
      sizeBytes: content.byteLength,
      sha256: checksum,
      contentType
    };
  }

  async readText(artifactKey: string): Promise<string | null> {
    const buffer = await this.readBuffer(artifactKey);
    return buffer?.toString("utf8") ?? null;
  }

  async readBuffer(artifactKey: string): Promise<Buffer | null> {
    const response = await this.request("GET", artifactKey);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`S3 artifact read failed for ${artifactKey}: ${response.status} ${await response.text()}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async head(artifactKey: string): Promise<ArtifactMetadata | null> {
    const response = await this.request("HEAD", artifactKey);
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`S3 artifact head failed for ${artifactKey}: ${response.status}`);
    }

    return {
      artifactKey,
      sizeBytes: Number(response.headers.get("content-length") ?? 0),
      sha256: response.headers.get("x-amz-meta-sha256") ?? undefined,
      contentType: response.headers.get("content-type") ?? undefined
    };
  }

  async materialize(artifactKeyOrPrefix: string, destinationPath: string): Promise<void> {
    await fs.rm(destinationPath, { recursive: true, force: true });
    await fs.mkdir(destinationPath, { recursive: true });

    const object = await this.readBuffer(artifactKeyOrPrefix);
    if (object) {
      await fs.writeFile(path.join(destinationPath, path.basename(artifactKeyOrPrefix)), object);
      return;
    }

    const prefix = artifactKeyOrPrefix.endsWith("/") ? artifactKeyOrPrefix : `${artifactKeyOrPrefix}/`;
    const keys = await this.listKeys(prefix);
    if (keys.length === 0) {
      throw new Error(`S3 artifact prefix was not found: ${artifactKeyOrPrefix}`);
    }

    await Promise.all(
      keys.map(async (key) => {
        const relative = key.startsWith(prefix) ? key.slice(prefix.length) : path.posix.basename(key);
        const destination = resolveWithinRoot(destinationPath, relative);
        const content = await this.readBuffer(key);
        if (!content) {
          return;
        }
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, content);
      })
    );
  }

  async uploadDirectory(prefix: string, directoryPath: string): Promise<void> {
    const files = await collectFiles(directoryPath);
    await Promise.all(
      files.map(async (filePath) => {
        const relative = toPosixPath(path.relative(directoryPath, filePath));
        await this.writeBuffer(toPosixPath(path.join(prefix, relative)), await fs.readFile(filePath), guessContentType(relative));
      })
    );
  }

  private async listKeys(prefix: string): Promise<string[]> {
    const query = {
      "list-type": "2",
      prefix: this.fullKey(prefix)
    };
    const response = await this.request("GET", "", { query });
    if (!response.ok) {
      throw new Error(`S3 artifact list failed for ${prefix}: ${response.status} ${await response.text()}`);
    }

    const xml = await response.text();
    const prefixToStrip = this.fullKey("");
    return [...xml.matchAll(/<Key>(.*?)<\/Key>/gu)]
      .map((match) => xmlDecode(match[1] ?? ""))
      .map((key) => (prefixToStrip && key.startsWith(prefixToStrip) ? key.slice(prefixToStrip.length) : key))
      .filter(Boolean);
  }

  private request(
    method: "GET" | "HEAD" | "PUT",
    artifactKey: string,
    options: {
      body?: Buffer | undefined;
      headers?: Record<string, string> | undefined;
      query?: Record<string, string> | undefined;
    } = {}
  ): Promise<Response> {
    const body = options.body ?? Buffer.alloc(0);
    const payloadHash = sha256Buffer(body);
    const url = this.buildUrl(artifactKey, options.query);
    const headers = this.sign(method, url, payloadHash, options.headers ?? {});

    const requestInit: RequestInit = {
      method,
      headers
    };
    if (method === "PUT") {
      // Node Buffer is accepted by Node fetch at runtime, but DOM BodyInit
      // typings used by Render's worker build do not treat Buffer as assignable.
      // Keep runtime behavior unchanged and use a narrow cast for the fetch body.
      requestInit.body = body as unknown as BodyInit;
    }

    return fetch(url, requestInit);
  }

  private buildUrl(artifactKey: string, query?: Record<string, string>): URL {
    const url = new URL(this.endpoint.toString());
    const fullKey = this.fullKey(artifactKey);

    if (this.config.forcePathStyle) {
      url.pathname = joinUrlPath(url.pathname, this.config.bucket, fullKey);
    } else {
      url.hostname = `${this.config.bucket}.${url.hostname}`;
      url.pathname = joinUrlPath(url.pathname, fullKey);
    }

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    return url;
  }

  private sign(
    method: string,
    url: URL,
    payloadHash: string,
    inputHeaders: Record<string, string>
  ): Record<string, string> {
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...lowercaseHeaders(inputHeaders)
    };

    if (this.config.sessionToken) {
      headers["x-amz-security-token"] = this.config.sessionToken;
    }

    const signedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderKeys.map((key) => `${key}:${headers[key]!.trim()}\n`).join("");
    const signedHeaders = signedHeaderKeys.join(";");
    const canonicalRequest = [
      method,
      normalizeCanonicalPath(url.pathname),
      canonicalQueryString(url),
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join("\n");
    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest)
    ].join("\n");
    const signingKey = getSignatureKey(this.config.secretAccessKey, dateStamp, this.config.region, "s3");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    headers.authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`
    ].join(", ");

    return headers;
  }

  private fullKey(artifactKey: string): string {
    return toPosixPath(path.join(this.config.prefix, artifactKey)).replace(/^\/+/u, "");
  }
}

async function copyDirectory(sourceRoot: string, destinationRoot: string): Promise<void> {
  const files = await collectFiles(sourceRoot);
  await Promise.all(
    files.map(async (filePath) => {
      const relative = path.relative(sourceRoot, filePath);
      const destination = resolveWithinRoot(destinationRoot, relative);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(filePath, destination);
    })
  );
}

async function collectFiles(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true }).catch((error: unknown) => {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function guessContentType(relativePath: string): string {
  if (relativePath.endsWith(".json")) return "application/json";
  if (relativePath.endsWith(".md")) return "text/markdown";
  if (relativePath.endsWith(".log") || relativePath.endsWith(".txt")) return "text/plain";
  if (relativePath.endsWith(".pdf")) return "application/pdf";
  if (relativePath.endsWith(".sol")) return "text/plain";
  return "application/octet-stream";
}

function joinUrlPath(...segments: string[]): string {
  return `/${segments
    .flatMap((segment) => segment.split("/"))
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/")}`;
}

function normalizeCanonicalPath(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)).replace(/[!'()*]/gu, escapeChar))
    .join("/");
}

function canonicalQueryString(url: URL): string {
  return [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function lowercaseHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/gu, "");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function getSignatureKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const dateKey = createHmac("sha256", `AWS4${secret}`).update(dateStamp).digest();
  const regionKey = createHmac("sha256", dateKey).update(region).digest();
  const serviceKey = createHmac("sha256", regionKey).update(service).digest();
  return createHmac("sha256", serviceKey).update("aws4_request").digest();
}

function xmlDecode(value: string): string {
  return value
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, "&");
}

function escapeChar(value: string): string {
  return `%${value.charCodeAt(0).toString(16).toUpperCase()}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
