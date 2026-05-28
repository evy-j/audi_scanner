export type ChainEnvironment = "MAINNET" | "TESTNET" | "DEVNET" | "LOCAL";
export type ChainType = "EVM" | "SOLANA" | "COSMOS" | "SUBSTRATE" | "OTHER";
export type ChainFeatureStatus = "SUPPORTED" | "PARTIAL" | "NOT_SUPPORTED" | "NOT_ASSESSED";

export interface ChainRegistryDefinition {
  slug: string;
  name: string;
  chainType: ChainType;
  environment: ChainEnvironment;
  networkId?: number;
  caip2Id?: string;
  nativeSymbol: string;
  explorer?: {
    name: string;
    baseUrl: string;
    apiBaseUrl?: string;
    supportsContractVerification?: boolean;
  };
  features: Record<string, ChainFeatureStatus>;
  notes?: string;
}

export const chainFeatureKeys = [
  "address_scan",
  "source_verification",
  "explorer_api",
  "monitoring",
  "simulation",
  "fuzzing",
  "threat_intel",
  "token_analysis",
  "liquidity_monitoring",
  "oracle_monitoring"
] as const;

export type ChainFeatureKey = (typeof chainFeatureKeys)[number];

export const defaultChainRegistry: ChainRegistryDefinition[] = [
  {
    slug: "ethereum-mainnet",
    name: "Ethereum Mainnet",
    chainType: "EVM",
    environment: "MAINNET",
    networkId: 1,
    caip2Id: "eip155:1",
    nativeSymbol: "ETH",
    explorer: {
      name: "Etherscan",
      baseUrl: "https://etherscan.io",
      apiBaseUrl: "https://api.etherscan.io/api",
      supportsContractVerification: true
    },
    features: {
      address_scan: "SUPPORTED",
      source_verification: "PARTIAL",
      explorer_api: "PARTIAL",
      monitoring: "SUPPORTED",
      simulation: "SUPPORTED",
      fuzzing: "SUPPORTED",
      threat_intel: "SUPPORTED",
      token_analysis: "SUPPORTED",
      liquidity_monitoring: "PARTIAL",
      oracle_monitoring: "PARTIAL"
    }
  },
  {
    slug: "polygon-mainnet",
    name: "Polygon PoS",
    chainType: "EVM",
    environment: "MAINNET",
    networkId: 137,
    caip2Id: "eip155:137",
    nativeSymbol: "POL",
    explorer: {
      name: "PolygonScan",
      baseUrl: "https://polygonscan.com",
      apiBaseUrl: "https://api.polygonscan.com/api",
      supportsContractVerification: true
    },
    features: {
      address_scan: "SUPPORTED",
      source_verification: "PARTIAL",
      explorer_api: "PARTIAL",
      monitoring: "SUPPORTED",
      simulation: "SUPPORTED",
      fuzzing: "SUPPORTED",
      threat_intel: "SUPPORTED",
      token_analysis: "SUPPORTED",
      liquidity_monitoring: "PARTIAL",
      oracle_monitoring: "PARTIAL"
    }
  },
  {
    slug: "bsc-mainnet",
    name: "BNB Smart Chain",
    chainType: "EVM",
    environment: "MAINNET",
    networkId: 56,
    caip2Id: "eip155:56",
    nativeSymbol: "BNB",
    explorer: {
      name: "BscScan",
      baseUrl: "https://bscscan.com",
      apiBaseUrl: "https://api.bscscan.com/api",
      supportsContractVerification: true
    },
    features: {
      address_scan: "SUPPORTED",
      source_verification: "PARTIAL",
      explorer_api: "PARTIAL",
      monitoring: "SUPPORTED",
      simulation: "SUPPORTED",
      fuzzing: "SUPPORTED",
      threat_intel: "SUPPORTED",
      token_analysis: "SUPPORTED",
      liquidity_monitoring: "PARTIAL",
      oracle_monitoring: "PARTIAL"
    }
  },
  {
    slug: "arbitrum-one",
    name: "Arbitrum One",
    chainType: "EVM",
    environment: "MAINNET",
    networkId: 42161,
    caip2Id: "eip155:42161",
    nativeSymbol: "ETH",
    explorer: {
      name: "Arbiscan",
      baseUrl: "https://arbiscan.io",
      apiBaseUrl: "https://api.arbiscan.io/api",
      supportsContractVerification: true
    },
    features: {
      address_scan: "SUPPORTED",
      source_verification: "PARTIAL",
      explorer_api: "PARTIAL",
      monitoring: "SUPPORTED",
      simulation: "SUPPORTED",
      fuzzing: "SUPPORTED",
      threat_intel: "SUPPORTED",
      token_analysis: "SUPPORTED",
      liquidity_monitoring: "PARTIAL",
      oracle_monitoring: "PARTIAL"
    }
  },
  {
    slug: "optimism-mainnet",
    name: "OP Mainnet",
    chainType: "EVM",
    environment: "MAINNET",
    networkId: 10,
    caip2Id: "eip155:10",
    nativeSymbol: "ETH",
    explorer: {
      name: "Optimistic Etherscan",
      baseUrl: "https://optimistic.etherscan.io",
      apiBaseUrl: "https://api-optimistic.etherscan.io/api",
      supportsContractVerification: true
    },
    features: {
      address_scan: "SUPPORTED",
      source_verification: "PARTIAL",
      explorer_api: "PARTIAL",
      monitoring: "SUPPORTED",
      simulation: "SUPPORTED",
      fuzzing: "SUPPORTED",
      threat_intel: "SUPPORTED",
      token_analysis: "SUPPORTED",
      liquidity_monitoring: "PARTIAL",
      oracle_monitoring: "PARTIAL"
    }
  },
  {
    slug: "base-mainnet",
    name: "Base",
    chainType: "EVM",
    environment: "MAINNET",
    networkId: 8453,
    caip2Id: "eip155:8453",
    nativeSymbol: "ETH",
    explorer: {
      name: "BaseScan",
      baseUrl: "https://basescan.org",
      apiBaseUrl: "https://api.basescan.org/api",
      supportsContractVerification: true
    },
    features: {
      address_scan: "SUPPORTED",
      source_verification: "PARTIAL",
      explorer_api: "PARTIAL",
      monitoring: "SUPPORTED",
      simulation: "SUPPORTED",
      fuzzing: "SUPPORTED",
      threat_intel: "SUPPORTED",
      token_analysis: "SUPPORTED",
      liquidity_monitoring: "PARTIAL",
      oracle_monitoring: "PARTIAL"
    }
  },
  {
    slug: "avalanche-c-chain",
    name: "Avalanche C-Chain",
    chainType: "EVM",
    environment: "MAINNET",
    networkId: 43114,
    caip2Id: "eip155:43114",
    nativeSymbol: "AVAX",
    explorer: {
      name: "SnowTrace",
      baseUrl: "https://snowtrace.io",
      apiBaseUrl: "https://api.snowtrace.io/api",
      supportsContractVerification: true
    },
    features: {
      address_scan: "SUPPORTED",
      source_verification: "PARTIAL",
      explorer_api: "PARTIAL",
      monitoring: "SUPPORTED",
      simulation: "SUPPORTED",
      fuzzing: "SUPPORTED",
      threat_intel: "PARTIAL",
      token_analysis: "SUPPORTED",
      liquidity_monitoring: "PARTIAL",
      oracle_monitoring: "PARTIAL"
    }
  },
  {
    slug: "sepolia",
    name: "Sepolia Testnet",
    chainType: "EVM",
    environment: "TESTNET",
    networkId: 11155111,
    caip2Id: "eip155:11155111",
    nativeSymbol: "ETH",
    explorer: {
      name: "Sepolia Etherscan",
      baseUrl: "https://sepolia.etherscan.io",
      apiBaseUrl: "https://api-sepolia.etherscan.io/api",
      supportsContractVerification: true
    },
    features: {
      address_scan: "SUPPORTED",
      source_verification: "PARTIAL",
      explorer_api: "PARTIAL",
      monitoring: "SUPPORTED",
      simulation: "SUPPORTED",
      fuzzing: "SUPPORTED",
      threat_intel: "NOT_ASSESSED",
      token_analysis: "PARTIAL",
      liquidity_monitoring: "NOT_ASSESSED",
      oracle_monitoring: "NOT_ASSESSED"
    }
  },
  {
    slug: "solana-mainnet",
    name: "Solana Mainnet Beta",
    chainType: "SOLANA",
    environment: "MAINNET",
    caip2Id: "solana:mainnet",
    nativeSymbol: "SOL",
    explorer: {
      name: "Solscan",
      baseUrl: "https://solscan.io",
      supportsContractVerification: false
    },
    features: {
      address_scan: "PARTIAL",
      source_verification: "NOT_SUPPORTED",
      explorer_api: "NOT_ASSESSED",
      monitoring: "PARTIAL",
      simulation: "NOT_SUPPORTED",
      fuzzing: "NOT_SUPPORTED",
      threat_intel: "PARTIAL",
      token_analysis: "PARTIAL",
      liquidity_monitoring: "NOT_ASSESSED",
      oracle_monitoring: "NOT_ASSESSED"
    },
    notes: "P14 registers Solana metadata but EVM analyzers remain the only executable scanner path unless a real Solana adapter is implemented later."
  }
];

export function normalizeEvmAddress(address: string): string | null {
  const trimmed = address.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function normalizeSolanaAddress(address: string): string | null {
  const trimmed = address.trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed) ? trimmed : null;
}

export function normalizeAddressForChain(chainType: ChainType, address: string): string | null {
  if (chainType === "EVM") return normalizeEvmAddress(address);
  if (chainType === "SOLANA") return normalizeSolanaAddress(address);
  return null;
}
