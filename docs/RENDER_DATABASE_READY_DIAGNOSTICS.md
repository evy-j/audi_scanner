# Render database readiness diagnostics

This patch adds a safe diagnostics mode for `/api/v1/ready` and `/api/v1/health/deep`.

## Why

The API was returning only:

```json
{ "checks": { "database": "failed" } }
```

That hides the real Prisma/PostgreSQL/Supabase error.

## How to enable temporarily

In Render API service environment variables set:

```env
READINESS_DIAGNOSTICS=true
```

Redeploy/restart the API, then run:

```powershell
curl https://audit-scanner-api.onrender.com/api/v1/ready
curl https://audit-scanner-api.onrender.com/api/v1/health/deep
```

The response will include a redacted `diagnostics.database` object with the Prisma/PostgreSQL error code and message.

## Turn it off after debugging

After the database issue is fixed, set:

```env
READINESS_DIAGNOSTICS=false
```

This keeps production readiness output clean.

## Common Supabase/Render causes

- Using direct `db.<project-ref>.supabase.co` instead of Supabase Session Pooler on Render.
- Wrong pooler username. It should look like `postgres.<project-ref>`.
- Password contains special characters and is not URL encoded.
- Password in Render differs from the password that works locally.
- Missing `sslmode=require`.
- Database migrations are not fully applied.
