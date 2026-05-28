# Phase P12 CI/CD Setup

CI/CD support uses scoped P11 API keys. Create a key with the narrowest usable scopes:

```text
repository:read
repository:scan
scan:create
```

Optional restrictions:

- project restriction through `projectId`
- repository restriction through `githubRepositoryId`
- expiry through `expiresAt`

Denied cases:

- revoked key
- expired key
- missing scope
- wrong project scope
- wrong repository scope

All API key create/use/revoke/deny events are audited. Raw API keys are shown only once at creation.

P12B CI scans upload a sanitized source artifact first, then create a scan from `sourceArtifactId`:

```bash
web3guard ci --path . --json-out web3guard-report.json --sarif-out web3guard.sarif
```

CI scan requests do not imply success unless source ingestion stores an artifact and the scan completes. SARIF is not written when no real persisted SARIF exists.
