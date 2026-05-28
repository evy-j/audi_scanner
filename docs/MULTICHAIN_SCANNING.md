# Multi-chain Scanning

P14B connects the P14 chain registry to real scan execution.

Flow:

```text
chainId + contractAddress
→ explorer verification fetch
→ sanitized source artifact
→ existing SOURCE scan pipeline
→ reports/monitoring can show chain/explorer context
```

Direct address scans still do not fabricate source. If explorer source is unavailable, the API returns `SOURCE_NOT_VERIFIED`, `PROVIDER_NOT_CONFIGURED`, `RATE_LIMITED`, `NOT_ASSESSED`, or `FAILED` and no scan is queued from fake data.
