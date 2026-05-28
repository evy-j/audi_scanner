# Real Auditor Onboarding

This workflow tracks real humans only. Do not create fake auditor profiles, fake credentials, fake availability, or fake sign-off.

Required evidence:

- real user account
- NDA or contract reference
- portfolio / prior audit / skills evidence
- conflict-of-interest declaration
- internal reviewer approval
- scope limitations

Safe statuses:

- `NEEDS_HUMAN_REVIEW` before approval
- `APPROVED` only after real evidence is attached
- `PUBLISHED` only when the auditor explicitly consents to public profile display

API:

```text
GET  /api/v1/security-os/trust-operations/auditors
POST /api/v1/security-os/trust-operations/auditors
```

This is an operations tracker, not a certification authority.
