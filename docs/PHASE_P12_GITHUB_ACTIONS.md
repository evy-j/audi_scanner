# Phase P12 GitHub Actions

Use `docs/templates/web3guard.yml` as the starting workflow.

Required repository secrets:

```text
WEB3GUARD_API_URL
WEB3GUARD_API_KEY
WEB3GUARD_ORG_ID
WEB3GUARD_PROJECT_ID
```

The workflow:

- checks out the repository
- runs the Web3Guard CLI
- writes `web3guard-report.json`
- writes `web3guard.sarif` only when real SARIF exists
- uploads SARIF only if the file exists

SARIF upload requires GitHub code scanning support and `security-events: write` permission.

The workflow never fabricates a successful scan. If the backend, API key, source upload, or safe scan path is not configured, the CLI exits with a configuration or execution error.
