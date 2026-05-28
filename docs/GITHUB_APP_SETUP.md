# GitHub App Setup

See [PHASE_P12_GITHUB_APP_SETUP.md](PHASE_P12_GITHUB_APP_SETUP.md) for the base GitHub App setup.

P12B adds repository source ingestion. The app must be configured and installed before source can be fetched. Missing credentials return `PROVIDER_NOT_CONFIGURED`; token failures return `TOKEN_ERROR`; unmapped repositories return `MANUAL_SETUP_REQUIRED`.

Repository scanning uses real GitHub tree/blob data only and never fabricates archives or scan results.
