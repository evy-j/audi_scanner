# Chain Seed Workspace Import Fix

## Problem

`npm run chain:seed` could fail with:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@audit-scanner/shared' imported from packages/database/prisma/chain-registry-seed.ts
```

This happens when the seed script is executed through the database workspace before the local workspace package alias is resolvable in the runtime environment.

## Fix

`packages/database/prisma/chain-registry-seed.ts` now imports the chain registry definition through a relative TypeScript source path instead of relying on the workspace package alias at seed runtime:

```ts
import { defaultChainRegistry } from "../../shared/src/chains/chain-registry.ts";
```

This keeps the seed script portable for local Windows runs, Render shell runs, and workspace command execution.

## Commands

Run from the repository root:

```powershell
npm install
npm run db:generate
npm run db:deploy
npm run billing:seed
npm run chain:seed
```

If migrations are already deployed, you can run only:

```powershell
npm run chain:seed
```
