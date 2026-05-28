import { decodeEventLog, type Abi, type Hex } from "viem";

export interface DecodedOnchainEvent {
  eventName: string | null;
  decodedData: Record<string, unknown> | null;
  decodeStatus: "DECODED" | "DECODE_FAILED" | "NOT_ASSESSED";
}

export function decodeLogWithAbi(input: {
  abi: unknown;
  topics: string[];
  data: string;
}): DecodedOnchainEvent {
  if (!Array.isArray(input.abi) || input.abi.length === 0) {
    return { eventName: null, decodedData: null, decodeStatus: "NOT_ASSESSED" };
  }

  try {
    const decoded = decodeEventLog({
      abi: input.abi as Abi,
      topics: input.topics as [Hex, ...Hex[]],
      data: input.data as Hex
    });
    return {
      eventName: decoded.eventName ?? null,
      decodedData: normalizeDecodedArgs(decoded.args),
      decodeStatus: "DECODED"
    };
  } catch {
    return { eventName: null, decodedData: null, decodeStatus: "DECODE_FAILED" };
  }
}

export function getDecodedString(decodedData: unknown, key: string): string | null {
  if (!decodedData || typeof decodedData !== "object") return null;
  const value = (decodedData as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function getDecodedBigInt(decodedData: unknown, key: string): bigint | null {
  if (!decodedData || typeof decodedData !== "object") return null;
  const value = (decodedData as Record<string, unknown>)[key];
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/u.test(value)) return BigInt(value);
  return null;
}

function normalizeDecodedArgs(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((item, index) => [String(index), normalizeJson(item)]));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeJson(item)])
  );
}

function normalizeJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => normalizeJson(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeJson(item)])
    );
  }
  return value;
}
