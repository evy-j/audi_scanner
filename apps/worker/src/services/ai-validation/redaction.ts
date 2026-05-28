const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu;
const HEX_PRIVATE_KEY = /\b0x[a-fA-F0-9]{64}\b|\b[a-fA-F0-9]{64}\b/gu;
const OPENAI_STYLE_KEY = /\bsk-[A-Za-z0-9_-]{20,}\b/gu;
const KEY_VALUE_SECRET =
  /\b(api[_-]?key|secret|token|password|private[_-]?key)\b\s*[:=]\s*(['"])[^'"\r\n]{8,}\2/giu;
const SEED_PHRASE =
  /\b(?:[a-z]{3,}\s+){11,23}[a-z]{3,}\b/giu;

export function redactSecrets(value: string): string {
  return value
    .replace(PRIVATE_KEY_BLOCK, "[REDACTED_PRIVATE_KEY]")
    .replace(KEY_VALUE_SECRET, "$1=[REDACTED_SECRET]")
    .replace(OPENAI_STYLE_KEY, "[REDACTED_API_KEY]")
    .replace(HEX_PRIVATE_KEY, "[REDACTED_HEX_SECRET]")
    .replace(SEED_PHRASE, "[REDACTED_SEED_PHRASE]");
}

export function truncateAndRedact(value: string | null | undefined, maxLength: number): string | null {
  if (!value) {
    return null;
  }
  return redactSecrets(value).slice(0, maxLength);
}
