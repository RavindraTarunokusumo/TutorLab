# Commands Reference

Run commands from the repository root. Node 20.19+ and Docker Desktop are required for local database-backed runtime work.

```bash
npm install
copy .env.example .env.local
npm run db:up
npm run prisma:generate
npm run db:migrate
npm run dev
```

Set `DATABASE_URL` and `OPENAI_API_KEY` in `.env.local`. The OpenAI key is needed only for live ingestion/analysis; fixture tests mock that boundary.

## Common commands

```bash
npm run lint
npm run typecheck
npm run test:run
npm run test:e2e:fixture
npm run test:e2e
npm run build
npm run prisma:validate
npm run db:down
```

## Verification

The normal local quality gate is `npm run lint`, `npm run typecheck`, `npm run test:run`, and `npm run test:e2e:fixture`. Run `npm run test:e2e` and `npm run build` before a release/PR validation pass when the required services are available.

For live source verification, use only the owner-supplied practice exercise, sample exam, and marking scheme. Do not download substitute materials. Confirm that all three index, analyze, synthesize, and remain editable; the live check is pending until those PDFs are supplied.
