# Render Fix 18 — Health Redis Probe TypeScript Union Fix

## Problem
Render API build failed at:

```text
src/modules/health/health.service.ts(52,31): error TS2339: Property 'code' does not exist on type 'RedisProbeResult'.
src/modules/health/health.service.ts(53,52): error TS2339: Property 'reason' does not exist on type 'RedisProbeResult'.
src/modules/health/health.service.ts(56,48): error TS2339: Property 'reason' does not exist on type 'RedisProbeResult'.
```

## Root cause
`RedisProbeResult` is a discriminated union:

- `RedisProbeOk` has `ok: true`
- `RedisProbeFailed` has `ok: false`, `reason`, `code`

The health diagnostics block accessed `reason` and `code` inside an inline ternary expression. Render's TypeScript build did not narrow that union safely in that expression.

## Fix
Moved Redis failure diagnostics into a helper function:

```ts
function redisFailureDiagnostics(redisResult: RedisProbeResult) {
  if (redisResult.ok) return undefined;
  const failed = redisResult as RedisProbeFailure;
  return {
    code: failed.code,
    message: redactConfigValue(failed.reason),
    target: failed.target,
    mode: failed.mode,
    hint: redisFailureHint(failed.reason)
  };
}
```

## Files changed

```text
apps/api/src/modules/health/health.service.ts
```

## Notes
This fix does not fake Redis readiness. It only makes diagnostics compile cleanly. `/health` remains stable; `/ready` remains real-only and may return degraded/not_ready depending on Redis and workerQueue status.
