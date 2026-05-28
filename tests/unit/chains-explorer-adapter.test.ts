import { describe, expect, it } from "vitest";
import { normalizeEvmAddress } from "@audit-scanner/shared";

describe("P14B explorer verification safety", () => {
  it("normalizes EVM addresses without fabricating non-address values", () => {
    expect(normalizeEvmAddress("0x0000000000000000000000000000000000000000")).toBe("0x0000000000000000000000000000000000000000");
    expect(normalizeEvmAddress("not-an-address")).toBeNull();
  });
});
