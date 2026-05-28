# CI Source Upload

GitHub Actions and other CI systems should use the CLI source upload path:

```bash
web3guard ci --path . --json-out web3guard-report.json --sarif-out web3guard.sarif
```

Required secrets:

```text
WEB3GUARD_API_URL
WEB3GUARD_API_KEY
WEB3GUARD_ORG_ID
WEB3GUARD_PROJECT_ID
```

The CI command sanitizes source locally, uploads only allowed files, creates a scan from the stored artifact, waits for a real scan result, and writes JSON from the persisted response. SARIF is written only when real SARIF exists.

Exit codes:

```text
0 scan completed without threshold failure
1 scan completed and fail-on threshold matched
2 configuration/auth error
3 backend or scan execution error
```
