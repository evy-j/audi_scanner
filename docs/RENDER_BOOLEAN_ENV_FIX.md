# Render Boolean Env Fix

Render stores environment variables as strings. Zod `z.coerce.boolean()` treats any non-empty string as `true`, so values like `AI_ENABLED=false` and `MONITORING_ENABLED=false` were being parsed as `true`.

This patch adds a safe boolean parser in `apps/api/src/config/environment.ts` so these values now work correctly:

- `true`, `1`, `yes`, `y`, `on` => true
- `false`, `0`, `no`, `n`, `off`, empty string => false

For free/smoke deployment, keep:

```env
AI_ENABLED=false
MONITORING_ENABLED=false
SIMULATION_ENABLED=false
FUZZING_ENABLED=false
BILLING_ENABLED=false
```

Then redeploy Render.
