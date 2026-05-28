# Source Ingestion

P12B source ingestion is a private, tenant-scoped bridge into the existing `SOURCE` scan pipeline.

Every stored artifact includes a manifest, checksum, storage key, origin kind, file count, total size, ignored/rejected counts, and policy decisions. Scans are queued only after the artifact reaches `STORED`.

Default exclusions include `.git`, `node_modules`, `.next`, `dist`, `build`, `coverage`, `cache`, `out`, `artifacts`, `.env`, key files, seed/mnemonic files, and large binaries. High-risk secrets are rejected and never written to the artifact directory.

Endpoints:

```text
POST /api/v1/source-artifacts/upload
GET /api/v1/source-artifacts/:artifactId
GET /api/v1/source-artifacts/:artifactId/manifest
GET /api/v1/source-ingestion-runs/:runId
```

All endpoints enforce organization/project/repository access and API-key scope.
