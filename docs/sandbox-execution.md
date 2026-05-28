# Scanner Sandbox Execution

## Architecture

```text
BullMQ analyzer job
  -> worker analyzer processor
  -> ContainerizedScannerExecutionService
  -> ScannerExecutionPolicyFactory
  -> ContainerSandboxExecutor
  -> docker run --rm audit-scanner/scanner-*
  -> /workspace: read-only prepared source
  -> /output: per-run writable temp directory
  -> bounded output import into durable artifacts
  -> stdout/stderr/result artifacts
  -> temp workspace cleanup
```

## Container Contract

- Scanner containers run as non-root `10001:10001`.
- Source code is mounted read-only at `/workspace`.
- Output is mounted read-write at `/output` from `.scanner-tmp`.
- The worker imports scanner output into `.artifacts/scanner-runs/...` after the run.
- Imported output is bounded by `SCANNER_MAX_OUTPUT_ARTIFACTS` and `SCANNER_MAX_OUTPUT_ARTIFACT_BYTES`.
- Root filesystem is read-only.
- Runtime temp state is isolated to `/tmp` tmpfs.
- Network defaults to `none`.
- IPC defaults to `none`.
- Docker receives an argument array directly; no shell command is composed.

## Hardening

- `--cap-drop ALL`
- `--security-opt no-new-privileges`
- `--privileged=false`
- `--ipc none`
- Optional seccomp profile: `docker/security/seccomp-scanner.json`
- Optional AppArmor profile through `SCANNER_APPARMOR_PROFILE`
- CPU limit per analyzer
- Memory limit and memory swap disabled
- PID limit
- `nofile` ulimit
- Tmpfs with `nosuid,nodev,noexec`
- Bounded stdout/stderr capture
- Timeout watchdog stops the scanner container
- Abort signal support stops the scanner container
- Docker `--rm` removes runtime containers after execution
- Timed out, canceled, or output-limited runs also attempt `docker rm --force`
- Worker startup removes stale temp workspaces older than `SCANNER_TEMP_RETENTION_MS`

## Isolation Strategy

- Prepared source artifacts stay under `SCANNER_ARTIFACT_ROOT` and are mounted read-only.
- Container-writable output uses `SCANNER_TEMP_ROOT` so scanners cannot write directly into durable artifact storage.
- `SCANNER_TEMP_ROOT` must not be the same directory as `SCANNER_ARTIFACT_ROOT`.
- The only writable mounts are `/output` and `/tmp`.
- Scanner images are built with toolchains installed up front, so runtime containers can run with network disabled.
- Pull policy defaults to `never`; production workers should pre-build and pin scanner image tags.

## Cleanup

- Per-run temp directories are removed in a `finally` block after output import and result artifact creation.
- Cleanup failures are logged as warnings so scan results are not lost.
- Stale temp directories are removed when the worker starts.
- Durable artifacts are not removed by the sandbox cleanup path.

## Network Restrictions

- Runtime scanner containers use `SCANNER_NETWORK_MODE=none` by default.
- No ports are published by the runner or scanner compose file.
- Scanner smoke-test services also run with `network_mode: none`.
- A network-enabled mode should only be used for a deliberately isolated Docker network and trusted scanner image tags.

## Key Environment Controls

| Variable | Default | Purpose |
| --- | --- | --- |
| `SCANNER_ARTIFACT_ROOT` | `.artifacts` | Durable prepared source and result artifacts. |
| `SCANNER_TEMP_ROOT` | `.scanner-tmp` | Container-writable per-run temp workspaces. |
| `SCANNER_NETWORK_MODE` | `none` | Docker runtime network mode. |
| `SCANNER_IPC_MODE` | `none` | Docker runtime IPC mode. |
| `SCANNER_DOCKER_PULL_POLICY` | `never` | Prevents implicit image pulls during scanner execution. |
| `SCANNER_CLEANUP_TEMP_WORKSPACE` | `true` | Removes per-run temp workspace after execution. |
| `SCANNER_TEMP_RETENTION_MS` | `86400000` | Startup cleanup age threshold for stale temp workspaces. |
| `SCANNER_MAX_OUTPUT_ARTIFACTS` | `64` | Maximum files imported from `/output`. |
| `SCANNER_MAX_OUTPUT_ARTIFACT_BYTES` | `104857600` | Maximum total bytes imported from `/output`. |

## Build

```bash
npm run docker:scanners:build
```

## Smoke Test

```bash
npm run docker:scanners:smoke
```
