# Render Fix 6 — Runtime health without paid Redis

Fixed the Render runtime `INTERNAL_ERROR` on `/api/v1/health`, `/api/v1/ready`, and `/api/v1/version` when Redis is not configured.

Changes:
- Default API rate limit store changed to `memory` for zero-cost single-service smoke deployments.
- Added `REDIS_REQUIRED=false` default.
- Added an in-process Redis compatibility store for health/auth/realtime smoke paths.
- Removed production startup crash for memory rate limiting.

Reality note: this is for free-tier/single-instance smoke deployment. Use real Redis for production queues, workers, and multi-instance rate limiting.
