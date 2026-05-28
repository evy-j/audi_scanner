# Private Beta Runbook

## Launch Steps

1. Confirm `.env.example` has no real secrets.
2. Configure staging secrets in the hosting providers.
3. Run:

```text
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
```

4. Start API and worker.
5. Deploy web.
6. Verify:

```text
curl https://api.example.com/api/v1/health
curl https://api.example.com/api/v1/ready
curl https://api.example.com/api/v1/version
```

7. Create or invite an admin user through the normal auth flow.
8. Set `ADMIN_EMAIL` to that existing user and run:

```text
npm run admin:bootstrap
```

The bootstrap command never creates a password.

## Routine Checks

- Review error logs for `CONFIGURATION_ERROR`, `DATABASE_UNAVAILABLE`, `REDIS_UNAVAILABLE`, and `RATE_LIMITED`.
- Confirm usage counters are moving for scans, AI validations, remediation runs, and report exports.
- Confirm public report links expire and can be revoked.
- Confirm provider-not-configured states are clear when AI or PDF providers are disabled.

## Incident Actions

- Revoke public report links for affected reports.
- Rotate JWT, API key, and report-share secrets if exposure is suspected.
- Scale worker to zero if queue jobs need to pause.
- Disable AI by setting `AI_ENABLED=false` and `AI_PROVIDER=DISABLED`.
- Preserve audit logs for export/share/revoke activity.

## Rollback

1. Roll back web.
2. Roll back API.
3. Roll back worker.
4. Run `/api/v1/ready`.
5. Keep database migrations forward-only unless a tested rollback has been prepared.
