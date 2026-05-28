# Render Fix 5 — Boolean Env Parsing

Fixed startup crash where `AI_ENABLED=false` and `MONITORING_ENABLED=false` were parsed as true on Render.

Root cause: `z.coerce.boolean()` converts non-empty strings to true. Render env values are strings.

Changed: `apps/api/src/config/environment.ts` now uses a strict boolean parser.
