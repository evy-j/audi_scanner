# P17 Public Trust Registry Deep Layer

This document is part of the P15–P25+ deep implementation pack. It defines persisted artifacts, API behavior, UI expectations, evidence/provenance requirements, and fake-claim boundaries.

## Real-only policy

- No fabricated provider/tool result.
- No exploit instructions, transaction broadcasting, or autonomous exploitation.
- No fake audit sign-off, marketplace profile, customer, incident, uptime, certification, or formal proof.
- Missing providers/tools are represented as `NOT_ASSESSED`, `BLOCKED`, `FAILED`, or `NEEDS_HUMAN_REVIEW`.
- Public outputs require explicit provenance, evidence references, and redaction.

## Persistence

All records are stored as `SecurityOsArtifact` rows with:

- phase
- artifact type
- organization/project scope
- status
- provenance
- evidence references
- payload
- checksum when available
- audit records for create/status changes

## API usage

Use the generic endpoints under `/api/v1/security-os/deep/*` or the phase-specific namespace documented in `PHASE_P15_P25_DEEP_SUMMARY.md`.

## Limitations

This layer creates deep platform foundations. External tool adapters, real human audit operations, legal/compliance execution, and public trust track record must still be completed with real inputs.
