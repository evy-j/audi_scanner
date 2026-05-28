# Phase P12 Web3Guard CLI

The Web3Guard CLI is a safe developer workflow entry point. It does not execute exploit code, broadcast transactions, auto-confirm findings, or auto-apply remediation.

Environment variables:

```text
WEB3GUARD_API_URL
WEB3GUARD_API_KEY
WEB3GUARD_ORG_ID
WEB3GUARD_PROJECT_ID
```

Commands:

```text
web3guard auth status
web3guard scan path . --dry-run
web3guard scan path . --format json --output web3guard-report.json
web3guard scan github --repo owner/name --branch main
web3guard report --input report.json --format sarif --output web3guard.sarif
web3guard ci --path . --repo owner/name --json-out web3guard-report.json --sarif-out web3guard.sarif
```

Behavior:

- missing API URL/key/org returns exit code `2`
- source path scans create a sanitized source artifact before scan creation
- GitHub scans require the repository to be connected in Web3Guard
- SARIF conversion uses provided findings only
- no fake findings are emitted

Exit codes:

```text
0 scan completed without policy failure
1 scan completed and policy threshold failed
2 configuration or auth error
3 scan execution, provider, or internal error
```
