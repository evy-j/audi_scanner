import { describe, expect, it } from "vitest";
import { defaultChainRegistry, normalizeAddressForChain } from "@audit-scanner/shared";

describe("P14 chain registry", () => {
  it("contains only real-only seeded chain metadata", () => {
    expect(defaultChainRegistry.length).toBeGreaterThanOrEqual(8);
    expect(defaultChainRegistry.every((chain) => chain.slug && chain.name && chain.nativeSymbol)).toBe(true);
    expect(defaultChainRegistry.some((chain) => chain.slug === "ethereum-mainnet" && chain.networkId === 1)).toBe(true);
  });

  it("validates EVM addresses without guessing", () => {
    expect(normalizeAddressForChain("EVM", "0x0000000000000000000000000000000000000000")).toBe("0x0000000000000000000000000000000000000000");
    expect(normalizeAddressForChain("EVM", "0x123")).toBeNull();
  });

  it("keeps unsupported chain types explicit", () => {
    expect(normalizeAddressForChain("COSMOS", "cosmos1abc")).toBeNull();
  });
});
