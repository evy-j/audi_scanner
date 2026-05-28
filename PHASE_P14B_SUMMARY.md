# Phase P14B Chain Adapter, Explorer Verification, and Multi-chain Scan Integration Summary

This patch implements P14B only. It does not fabricate explorer data, verified source, ABI, proxy implementation addresses, scan results, monitoring events, or reports.

## Added

- Etherscan-style explorer adapter for configured EVM chain explorers
- verified source and ABI fetch endpoints
- persisted contract verification records
- persisted source file and ABI records
- explorer fetch run/artifact models
- explorer verified-source → private source artifact bridge
- verified contract scan endpoint that queues the existing SOURCE scan pipeline only after a real artifact is STORED
- chain-aware UI tool under `/settings/chains`
- docs for chain adapters, explorer verification, and multichain scanning

## Safety

- explorer API keys are read from env vars and never persisted
- RPC URLs and explorer secrets are not logged
- source artifacts use existing ignore/secret policy
- no scan is queued unless verified source becomes a STORED artifact
- direct ADDRESS scans still refuse to fabricate source

## Limitations

- executable adapter is EVM/Etherscan-style first
- non-EVM chains remain metadata-aware
- explorer rate limits and unavailable source return real failure states
- ABI unavailable is stored as NOT_ASSESSED

## Next recommended phase

P15 formal verification and specification layer.
