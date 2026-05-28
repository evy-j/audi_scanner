# P14 Multi-chain Registry and Chain Context

P14 turns the previous roadmap scaffold into an actual multi-chain registry layer.

## Safety Boundaries

P14 is metadata and configuration aware only. It does not fabricate provider status, explorer verification, chain monitoring data, source verification results, or scan findings.

- Raw RPC URLs are not persisted.
- Explorer API keys are not persisted.
- RPC endpoint records store provider name, environment variable key, redacted host, status, and audit metadata only.
- EVM remains the executable analyzer path unless a real adapter exists for another chain.
- Solana and other non-EVM chains can be registered, but unsupported scanner actions stay `NOT_SUPPORTED` or `NOT_ASSESSED`.

## Database Records

P14 adds:

- `ChainExplorer`
- `ChainRpcEndpoint`
- `ChainFeatureSupport`
- `ChainRegistryAuditEvent`

Existing `Chain`, `Contract`, `Scan`, `MonitorTarget`, and related models remain compatible.

## Seed Command

Run:

```bash
npm run chain:seed
```

The seed creates/upserts real metadata for Ethereum, Polygon, BNB Smart Chain, Arbitrum, OP Mainnet, Base, Avalanche C-Chain, Sepolia, and Solana metadata-only support.

The seed is idempotent and does not store RPC URLs or private keys.

## API Endpoints

```text
GET /api/v1/chains
GET /api/v1/chains/:chainId
GET /api/v1/chains/:chainId/explorers
GET /api/v1/chains/:chainId/features
GET /api/v1/chains/:chainId/rpc-endpoints
GET /api/v1/chains/:chainId/address/validate?address=...
POST /api/v1/orgs/:orgId/chains/:chainId/rpc-endpoints
```

All endpoints require authentication. Organization-scoped RPC endpoint writes require organization access and permissions.

## Frontend

The chain registry page is available at:

```text
/settings/chains
```

It shows chain metadata, EVM/non-EVM state, explorer links, feature status, and the real-only safety policy.

## Limitations

- P14 does not add Solana analyzer execution.
- P14 does not verify explorer source code automatically.
- P14 does not prove RPC health unless a real health worker is added later.
- P14 does not create fake chain status, price data, liquidity data, or wallet labels.

## Next Recommended Phase

P15: formal verification and specification layer.
