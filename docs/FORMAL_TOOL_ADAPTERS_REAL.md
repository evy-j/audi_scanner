# Formal Tool Adapters — Real Activation

P15 introduced formal verification records. This real-ops layer tracks whether external tools are actually installed/configured.

Supported adapter statuses should stay real-only:

- `NOT_ASSESSED` when no tool is configured
- `CONFIGURED` only with tool path/provider config and version metadata
- `SUCCEEDED` only with real run artifact, checksum, and reviewer approval
- `FAILED` only with real error output

Required metadata:

- tool name: SMTChecker, Scribble, Certora-compatible, or other
- version or provider status
- command/config checksum
- sample run artifact checksum
- limitations

Never claim formal proof when only a spec draft exists.

API:

```text
GET  /api/v1/security-os/trust-operations/formal-tool-adapters
POST /api/v1/security-os/trust-operations/formal-tool-adapters
```
