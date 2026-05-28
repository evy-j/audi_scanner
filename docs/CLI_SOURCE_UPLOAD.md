# CLI Source Upload

`web3guard scan path .` builds a sanitized local source bundle, uploads it to Web3Guard, creates a scan from the returned `sourceArtifactId`, and polls the scan.

Required environment:

```text
WEB3GUARD_API_URL
WEB3GUARD_API_KEY
WEB3GUARD_ORG_ID
WEB3GUARD_PROJECT_ID
```

Examples:

```bash
web3guard scan path . --dry-run
web3guard scan path . --format json --output web3guard-report.json
web3guard scan path . --format markdown --output web3guard-report.md
```

Options:

```text
--dry-run
--max-size-mb 25
--fail-on high
--format json|sarif|markdown
--output <path>
--include <glob>
--exclude <glob>
```

SARIF output is written only when the backend has real persisted SARIF for a completed or partial scan.
