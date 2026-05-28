export interface JsonParseResult {
  ok: boolean;
  value: unknown;
  error?: string | undefined;
}

export function parseScannerJson(raw: string): JsonParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      value: null,
      error: "scanner did not produce JSON output"
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(trimmed)
    };
  } catch (error) {
    const extracted = extractLikelyJson(trimmed);
    if (extracted) {
      try {
        return {
          ok: true,
          value: JSON.parse(extracted)
        };
      } catch {
        // Fall through to the original error to preserve the most useful message.
      }
    }

    return {
      ok: false,
      value: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function extractLikelyJson(raw: string): string | null {
  const objectStart = raw.indexOf("{");
  const objectEnd = raw.lastIndexOf("}");
  const arrayStart = raw.indexOf("[");
  const arrayEnd = raw.lastIndexOf("]");

  const candidates = [
    objectStart >= 0 && objectEnd > objectStart ? raw.slice(objectStart, objectEnd + 1) : null,
    arrayStart >= 0 && arrayEnd > arrayStart ? raw.slice(arrayStart, arrayEnd + 1) : null
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}
