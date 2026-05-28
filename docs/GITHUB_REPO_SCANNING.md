# GitHub Repository Scanning

GitHub repository scanning requires:

- real GitHub App configuration
- a real GitHub App installation
- a connected repository mapped to the organization
- organization/project/repository permission

Flow:

```text
POST /api/v1/repositories/:repositoryId/ingest
POST /api/v1/repositories/:repositoryId/scan
```

The backend creates an installation token only when configured, fetches GitHub tree/blob content for the requested branch, commit SHA, or PR head SHA, filters ignored files and secrets, stores a private source artifact, then creates a normal `SOURCE` scan.

Failure states are persisted as real states:

```text
PROVIDER_NOT_CONFIGURED
TOKEN_ERROR
MANUAL_SETUP_REQUIRED
SOURCE_REJECTED
FAILED
```

No scan is queued from a missing or rejected source artifact.
