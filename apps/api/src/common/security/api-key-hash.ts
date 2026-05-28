import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../../config/environment.js";

const API_KEY_PREFIX = "ask";

export interface GeneratedApiKey {
  key: string;
  prefix: string;
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(32).toString("base64url");
  const prefix = `${API_KEY_PREFIX}_${randomBytes(4).toString("hex")}`;
  const key = `${prefix}_${secret}`;

  return {
    key,
    prefix,
    hash: hashApiKey(key)
  };
}

export function getApiKeyPrefix(key: string): string | null {
  const parts = key.split("_");
  if (parts.length < 3 || parts[0] !== API_KEY_PREFIX) {
    return null;
  }

  return `${parts[0]}_${parts[1]}`;
}

export function hashApiKey(key: string): string {
  return createHmac("sha256", env.API_KEY_HASH_SECRET).update(key).digest("hex");
}

export function verifyApiKeyHash(key: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiKey(key), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
