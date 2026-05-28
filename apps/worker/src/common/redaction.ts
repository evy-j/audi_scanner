const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/postgres(?:ql)?:\/\/[^\s"'<>]+/giu, "[REDACTED_DATABASE_URL]"],
  [/redis:\/\/[^\s"'<>]+/giu, "[REDACTED_REDIS_URL]"],
  [/https?:\/\/[^\s"'<>]*(?:alchemy|infura|quicknode|rpc)[^\s"'<>]*/giu, "[REDACTED_RPC_URL]"],
  [/Bearer\s+[A-Za-z0-9._~-]+/giu, "Bearer [REDACTED]"],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, "[REDACTED_JWT]"],
  [/sk-[A-Za-z0-9_-]{8,}/gu, "[REDACTED_API_KEY]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu, "[REDACTED_PRIVATE_KEY]"]
];

export function redactSecretLikeValues<T>(value: T): T {
  if (typeof value === "string") {
    let redacted: string = value;
    for (const [pattern, replacement] of SECRET_PATTERNS) {
      redacted = redacted.replace(pattern, replacement);
    }
    return redacted as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSecretLikeValues(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactSecretLikeValues(item)])
    ) as T;
  }

  return value;
}
