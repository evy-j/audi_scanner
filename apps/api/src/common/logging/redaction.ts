const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/postgres(?:ql)?:\/\/[^\s"'<>]+/giu, "[REDACTED_DATABASE_URL]"],
  [/redis:\/\/[^\s"'<>]+/giu, "[REDACTED_REDIS_URL]"],
  [/https?:\/\/[^\s"'<>]*(?:alchemy|infura|quicknode|rpc)[^\s"'<>]*/giu, "[REDACTED_RPC_URL]"],
  [/MONITORING_RPC_URL\s*=\s*[^\s"'<>]+/giu, "MONITORING_RPC_URL=[REDACTED_RPC_URL]"],
  [/Bearer\s+[A-Za-z0-9._~-]+/giu, "Bearer [REDACTED]"],
  [/ask_[A-Za-z0-9]+_[A-Za-z0-9_-]+/gu, "[REDACTED_API_KEY]"],
  [/gh[opsru]_[A-Za-z0-9_]+/gu, "[REDACTED_GITHUB_TOKEN]"],
  [/(?:api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{24,}/giu, "secret=[REDACTED_SECRET]"],
  [/(?:seed|mnemonic)\s*(?:phrase)?\s*[:=]\s*["']?(?:[a-z]{3,12}\s+){11,23}[a-z]{3,12}/giu, "mnemonic=[REDACTED_SEED_PHRASE]"],
  [/github_app_(?:private_key|webhook_secret|client_secret)["']?\s*[:=]\s*["']?[^"',\s}]+/giu, "github_app_secret=[REDACTED_SECRET]"],
  [/billing_webhook_secret["']?\s*[:=]\s*["']?[^"',\s}]+/giu, "billing_webhook_secret=[REDACTED_SECRET]"],
  [/razorpay_(?:key_secret|webhook_secret)["']?\s*[:=]\s*["']?[^"',\s}]+/giu, "razorpay_secret=[REDACTED_SECRET]"],
  [/stripe_(?:secret_key|webhook_secret)["']?\s*[:=]\s*["']?[^"',\s}]+/giu, "stripe_secret=[REDACTED_SECRET]"],
  [/\bsk_(?:live|test)_[A-Za-z0-9]+/gu, "[REDACTED_STRIPE_SECRET]"],
  [/\brzp_(?:live|test)_[A-Za-z0-9]+/gu, "[REDACTED_RAZORPAY_KEY]"],
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
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, redactSecretLikeValues(item)])
    ) as T;
  }

  return value;
}
