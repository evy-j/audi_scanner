# Phase P12 GitHub App Setup

P12 GitHub App support is readiness-first and real-only. The integration remains inactive until real credentials are configured and a GitHub organization or repository owner installs the app.

Required API environment variables:

```text
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY
GITHUB_APP_WEBHOOK_SECRET
GITHUB_APP_CLIENT_ID
GITHUB_APP_CLIENT_SECRET
GITHUB_APP_NAME
```

If `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, or `GITHUB_APP_WEBHOOK_SECRET` is missing, the API returns `GitHub App not configured`.

Webhook URL:

```text
POST /api/v1/github/webhook
```

Implemented webhook handling:

- signed webhook verification with `X-Hub-Signature-256`
- invalid signature rejection
- installation suspend/unsuspend/delete updates when the installation is already mapped to a tenant
- repository added/removed updates when the installation is mapped
- push, pull request, check suite, and check run events are observed without fabricated scan results

Tenant mapping is explicit. Unknown installation webhooks are stored as not assessed until an organization connects the installation.

P12B repository ingestion uses the installation token to fetch real GitHub tree/blob content for a mapped repository, applies source filtering, stores a private source artifact, and then queues the existing `SOURCE` scan pipeline. If the app is missing, token creation fails, or the repository is not mapped, the API persists a real failure state instead of fabricating an archive.

Safety boundaries:

- no private keys, webhook secrets, or installation tokens are logged
- no repository scan result is fabricated
- no exploit execution or transaction broadcasting is performed
- no finding is auto-confirmed from GitHub metadata
