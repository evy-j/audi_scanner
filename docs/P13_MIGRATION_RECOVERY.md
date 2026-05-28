# P13 Migration Recovery: PostgreSQL enum transaction fix

## Problem

`npm run db:deploy` can fail on PostgreSQL/Supabase with:

```text
ERROR: unsafe use of new value "MANUAL_OVERRIDE" of enum type "SubscriptionStatus"
HINT: New enum values must be committed before they can be used.
```

The original P13 billing migration added new enum values and used `MANUAL_OVERRIDE` as a default in the same migration. PostgreSQL requires a newly added enum value to be committed before it is used.

## Fix included

A new migration was added before P13:

```text
packages/database/prisma/migrations/20260525165000_p13_billing_enum_prepare/migration.sql
```

The enum additions were removed from:

```text
packages/database/prisma/migrations/20260525170000_p13_billing/migration.sql
```

## Recovery commands after the failed migration

Run from the database workspace:

```powershell
cd C:\auit_scanner\packages\database

# Keep DATABASE_URL set via .env or current shell.
npx prisma migrate resolve --rolled-back 20260525170000_p13_billing --schema prisma/schema.prisma

cd C:\auit_scanner
npm run db:deploy
npm run billing:seed
npm run chain:seed
```

If Prisma says the failed migration is already resolved or not found, skip the resolve command and run `npm run db:deploy` again.

## Notes

- Do not delete Supabase project data unless you are intentionally resetting the database.
- Do not manually edit `_prisma_migrations` unless you know exactly what you are doing.
- This fix keeps the original P13 billing schema intact; it only splits enum preparation into a committed earlier migration.
