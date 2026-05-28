# Chain Adapters

P14B adds an Etherscan-style explorer adapter for EVM chains. The adapter is real-only:

- it requires a configured explorer API key env var or `ETHERSCAN_API_KEY`
- it calls explorer source/ABI endpoints only for configured chains
- it never fabricates source code, ABI, implementation addresses, or verification status
- it stores provider names and checksums, not API keys

Etherscan API V2 supports a unified multichain endpoint with a `chainid` parameter. Chain-specific explorers can also use their configured API base URL.

Non-EVM chains remain metadata-aware until a real adapter is implemented.
