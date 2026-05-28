import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../config/environment.js";
import { redactSecretLikeValues } from "../../common/logging/redaction.js";

export function verifyGitHubWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined, secret = env.GITHUB_APP_WEBHOOK_SECRET): boolean {
  if (!secret || !signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signatureHeader);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function redactGitHubPayload<T>(value: T): T {
  return redactSecretLikeValues(value);
}

export function safeRepoFullName(value: string): { owner: string; name: string; fullName: string } {
  const [owner, name] = value.split("/");
  if (!owner || !name || value.split("/").length !== 2) {
    throw new Error("Repository must be in owner/name format");
  }
  return { owner, name, fullName: `${owner}/${name}` };
}
