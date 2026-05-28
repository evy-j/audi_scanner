# CI/CD

See [PHASE_P12_CI_CD_SETUP.md](PHASE_P12_CI_CD_SETUP.md) for the base CI/CD setup.

P12B uses source upload in CI:

```bash
web3guard ci --path . --repo "$GITHUB_REPOSITORY" --branch "$GITHUB_REF_NAME" --commit-sha "$GITHUB_SHA"
```

CI requires a scoped API key and real backend URL. Revoked, expired, or wrong-scope keys are denied by the P11 API-key governance layer. SARIF is uploaded only if the CLI writes a real SARIF file.
