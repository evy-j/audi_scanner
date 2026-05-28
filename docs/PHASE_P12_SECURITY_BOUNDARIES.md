# Phase P12 Security Boundaries

P12 preserves P0-P11 controls.

P12 does not:

- execute exploit simulation
- generate exploit instructions
- broadcast transactions
- run autonomous exploitation agents
- brute force credentials
- perform DoS or stress testing
- auto-confirm findings
- auto-apply remediation patches
- fabricate CI results
- fabricate GitHub installation status
- claim SOC2, ISO, or other compliance certification

GitHub App credentials, webhook secrets, installation tokens, API keys, and private keys are redacted from logs and API responses.

Webhook payloads must pass HMAC verification. Invalid signatures are rejected and audited.

Cross-tenant repository access returns `ACCESS_DENIED` without revealing whether the foreign repository exists.
