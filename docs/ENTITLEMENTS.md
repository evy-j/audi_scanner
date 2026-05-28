# Entitlements

P13 entitlement checks run before jobs are queued. Denied actions return `ENTITLEMENT_DENIED`, `LIMIT_EXCEEDED`, `PAYMENT_REQUIRED`, or `SUBSCRIPTION_EXPIRED` and are audited.

Entitlements are evaluated from:

- active subscription, trial, or `FREE_BETA`
- manual admin override
- plan limits
- current month usage
- P11 organization security settings

Tracked keys include:

```text
scans.monthly
ai_validations.monthly
remediation.monthly
reports.monthly
source_artifacts.monthly
repo_connections.max
monitored_projects.max
simulations.monthly
fuzz_runs.monthly
threat_matches.monthly
team_members.max
api_keys.max
public_report_sharing
webhooks
github_app
cli_ci
enterprise_rbac
sso_readiness
```

Entitlement matches do not change finding severity, confidence, review status, or remediation status.
