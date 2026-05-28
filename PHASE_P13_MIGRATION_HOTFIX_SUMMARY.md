# Phase P13 Migration Hotfix Summary

## Fixed

PostgreSQL/Supabase failed P13 billing migration with:

```text
unsafe use of new value "MANUAL_OVERRIDE" of enum type "SubscriptionStatus"
```

## What changed

Added separate enum-preparation migration:

```text
packages/database/prisma/migrations/20260525165000_p13_billing_enum_prepare/migration.sql
```

Updated P13 billing migration to use enum values only after the enum-preparation migration has committed.

## Recovery

If the old P13 migration already failed on the database, mark it rolled back first:

```powershell
cd C:\auit_scanner\packages\database
npx prisma migrate resolve --rolled-back 20260525170000_p13_billing --schema prisma/schema.prisma
cd C:\auit_scanner
npm run db:deploy
```

Then run seeds:

```powershell
npm run billing:seed
npm run chain:seed
```
