# Test Suite

This directory is organized by platform risk boundary:

- `unit`: pure domain and helper tests
- `integration`: Redis, queue, and cross-module contracts
- `api`: Supertest HTTP contract tests
- `worker`: BullMQ processor and worker lifecycle tests
- `scanner`: analyzer adapter and sandbox artifact tests
- `prisma`: schema, migration, seed, and repository tests
- `frontend`: Vitest/jsdom component tests
- `e2e`: Playwright browser workflows
- `load`: load smoke orchestration and k6 scripts
- `security`: security invariant and abuse-case tests
- `mocks`: reusable test doubles for external boundaries
- `setup`: shared Vitest, API, and Prisma setup helpers

Install the test toolchain before running the suite:

```powershell
npm install --save-dev vitest @vitest/coverage-v8 @playwright/test supertest @types/supertest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event axe-core @axe-core/playwright
```

Then run:

```powershell
npm run test:unit
npm run test:api
npm run test:e2e
```
