# Render Deploy Fix 3

This patch targets the remaining Render API TypeScript build errors found after Vercel passed package compilation.

## Fixed

- Pinned Render/Node runtime to `20.x` instead of latest Node 26.
- Fixed wallet nonce `chainId` narrowing.
- Cast Prisma JSON metadata inputs for chain RPC endpoint upsert.
- Added explicit return typing around explorer source fetch result.
- Made viem log topics optional-compatible.
- Normalized review comment body before repository call.
- Cast Buffer request body for S3-compatible artifact upload.
- Replaced zod-inferred realtime client message type with an explicit discriminated union to avoid `never` narrowing in production TS build.

## Render settings

Build command:

```bash
npm install --include=dev && npm run build:api:render
```

Start command:

```bash
npm run start:api:render
```

Root Directory must be blank.
