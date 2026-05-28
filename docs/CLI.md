# CLI

See [PHASE_P12_CLI.md](PHASE_P12_CLI.md) for the base CLI commands.

P12B updates local scans:

```bash
web3guard scan path . --dry-run
web3guard scan path . --format json --output web3guard-report.json
web3guard ci --path . --json-out web3guard-report.json --sarif-out web3guard.sarif
```

The CLI now sanitizes source before upload, excludes ignored files and secrets, uploads a real source artifact, and creates scans from `sourceArtifactId`.
