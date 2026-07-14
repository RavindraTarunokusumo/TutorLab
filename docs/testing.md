# Testing Guide

## Purpose

Testing includes both execution and planning. All changes must pass lint, typecheck, and relevant tests before commit (see also `docs/commands.md` and AGENTS.md workflow).

## Prerequisites

- Node.js + npm (use npm for all package operations)
- PostgreSQL running (for Prisma-backed tests)
- Project dependencies installed (`npm install`)
- Prisma client generated (`npm run prisma:generate` or included in other scripts)
- A test database configured (recommended: separate `DATABASE_URL` or `DATABASE_URL_TEST` pointing at a clean Postgres instance or schema)
- Run commands from the repo root
- Mock all external services (especially OpenAI Responses API)
- Never use real credentials or production data in tests

## Linting and Formatting

Use these for style and static analysis:

```bash
# Check only
npm run lint

# Auto-fix (run before committing when possible)
npm run lint:fix

# Format (Prettier)
npm run format
npm run format:check
```

`npm run lint` runs Next.js ESLint (`next lint` or equivalent ESLint config). Prettier is run via pre-commit and `format` scripts.

## Type Checking

```bash
npm run typecheck
# or directly
npx tsc --noEmit
```

Type checking is required before commits and in CI. It is intentionally separate from `next build`.

## Test Layout

```
tests/
  unit/                 # Pure functions, schemas (Zod), state machines, deterministic checks
  integration/          # API route handlers, services with mocked or test DB
  e2e/                  # Playwright specs for critical user flows
fixtures/               # Seed data, course models, probability demo assets
prisma/                 # schema.prisma + migrations
```

- **Unit tests**: Vitest, fast, no DB or external I/O.
- **Integration tests**: Vitest + test Prisma client (lightweight DB state).
- **Browser / E2E tests**: Playwright against the Next.js app (dev server or preview build).
- Use `fixtures/` for reusable test data and the probability course pack.

## Core Fixtures and Helpers

- Reusable course model JSON and document fixtures live under `fixtures/probability-course/`.
- Deterministic evaluation fixtures for answer leakage, misconception detection, etc.
- Test DB helpers (e.g. `createTestPrismaClient`, cleanup utilities) should live in `tests/helpers/` or `lib/test-utils.ts`.
- All external AI calls are mocked at the client layer (`lib/ai/client.ts` or equivalent).

**Note:** The previous Python/pytest examples have been replaced for the Next.js + Vitest + Playwright stack.

## Running Tests (Vitest)

Vitest is used for unit and integration tests.

Run all tests (watch mode by default in many Vitest setups):

```bash
npm test
```

Run tests once (CI-friendly):

```bash
npm run test:run
```

Run a single file:

```bash
npx vitest run tests/unit/some-module.test.ts
```

Run tests matching a pattern:

```bash
npx vitest run -t "course model"
# or
npm run test:run -- tests/integration
```

Run with UI:

```bash
npm run test:ui
```

Stop on first failure:

```bash
npx vitest run --bail 1
```

Coverage (if configured):

```bash
npm run test:run -- --coverage
```

## Running E2E / Browser Tests (Playwright)

```bash
# Install browsers first time (or in CI)
npx playwright install --with-deps

# Run all E2E tests (uses playwright.config.ts)
npm run test:e2e
```

Run a specific spec:

```bash
npm run test:e2e -- tests/e2e/golden-path.spec.ts
```

Run in UI mode (debug):

```bash
npm run test:e2e:ui
```

Playwright golden path (from SPEC):

1. Create project
2. Complete wizard
3. Attach fixture documents
4. Load fixture course model (test mode)
5. Select a tutor design
6. Run build
7. Inspect and repair a failing scenario
8. Preview chat
9. Export

## Database and Prisma for Tests

Tests that touch persistence require a dedicated Postgres database.

Recommended setup:

1. Define a test connection string (e.g. in `.env.test` or CI secrets):
   ```
   DATABASE_URL_TEST="postgresql://user:pass@localhost:5432/tutorlab_test"
   ```

2. Before running DB tests:
   ```bash
   # Generate client (if not done)
   npm run prisma:generate

   # Apply schema to the test DB (fast, no migrations history)
   npx prisma db push --skip-generate --force-reset

   # Or use migrations for realism:
   # DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy
   ```

3. In test setup (`vitest.setup.ts` or per-suite):
   - Instantiate PrismaClient pointing at the test URL.
   - Use `beforeAll` / `afterAll` to reset state.
   - Prefer `prisma.$transaction` with rollback for isolated tests when possible.
   - Seed minimal data from fixtures when needed.

Never run against the development or production database.

## Full Verification Before Commit / PR

Run the complete local gate (lint + types + tests):

```bash
npm run lint
npm run typecheck
npm run test:run
npm run test:e2e   # when relevant (slower)
# Optionally
npm run build      # ensures production build succeeds
```

See `docs/commands.md` for the full list of project scripts once defined in `package.json`.

## Pre-commit Checks

Install the git hooks once:

```bash
pre-commit install
```

Pre-commit will then run automatically on `git commit`.

Manually run on staged files:

```bash
pre-commit run
```

Run on all files (useful after large refactors):

```bash
pre-commit run --all-files
```

The `.pre-commit-config` includes:
- Basic hygiene (trailing whitespace, EOF, YAML/JSON, large files, etc.)
- Prettier formatting
- ESLint (with --fix)
- `prisma format` + `prisma validate` (on schema changes)
- TypeScript type checking

Heavy operations such as the full test suite and E2E are intentionally kept out of the commit hook and are run manually or in CI.

## CI Expectations

CI should execute at minimum:
- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run test:run`
- Playwright E2E (with a test DB)
- `npm run build`

Live-model verification (real OpenAI calls against the probability demo) is run manually before releases per SPEC.
