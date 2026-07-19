![TutorLab Logo](public/tutorlab-logo.png)

# TutorLab

TutorLab is an evidence-grounded tutor builder for teachers and instructional designers. It turns course materials and teaching decisions into an inspectable tutor, evaluates that tutor against simulated learners, and exports a portable standalone chatbot package.

## What it does

TutorLab guides a teacher through eight stages:

1. **Brief** — define the course, audience, tone, and answer-sharing boundaries.
2. **Sources** — upload and classify course materials with explicit authority and permissions.
3. **Model** — review a compact, evidence-backed course model.
4. **Design** — compare three teaching approaches and tailor the selected one.
5. **Build** — compile a tutor policy and generate six evaluation scenarios.
6. **Report** — inspect evaluation results and teacher-actionable recommendations.
7. **Preview** — chat with the compiled tutor and inspect each reply’s grounding.
8. **Export** — download a standalone chatbot handoff package.

The core evidence flow is:

```text
SourceDocument → DocumentAnalysis → CourseModelVersion → TutorVersion → Evaluation evidence
```

Raw uploads and protected solutions stay out of the compact course model and student-facing retrieval context.

## Requirements

- Node.js 20.19 or newer
- Docker Desktop (for the local PostgreSQL database)
- An OpenAI API key for live ingestion, synthesis, and tutor runs

## Quick start

Run the following from the repository root in PowerShell:

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:up
npm run prisma:generate
npm run db:migrate
npm run dev
```

Set these values in `.env.local` before using live AI workflows:

```dotenv
DATABASE_URL="postgresql://tutorlab:tutorlab@localhost:5432/tutorlab?schema=public"
OPENAI_API_KEY="your-api-key"
PROJECT_EDIT_TOKEN_SECRET="a-random-secret-of-at-least-32-characters"
```

Open the URL printed by Next.js, usually `http://localhost:3000`.

## Course-material limits

The MVP accepts PDF and DOCX course materials within these workspace limits:

- Up to 30 files
- Up to 10 MB per file

Teachers declare each source’s role, authority, and allowed uses. Sources containing protected solutions are excluded from student-visible excerpts and runtime retrieval.

## Standalone export

The final Export stage packages the active tutor policy plus student-permitted course context for implementation by a developer or coding agent. It includes a lightweight local relevance selector, **not** a provider vector database, embeddings, authentication, rate limiting, session management, memory, or tool use. See the generated `README.md` inside each exported ZIP for integration guidance.

## Quality checks

```powershell
npm run lint
npm run typecheck
npm run test:run
npm run test:e2e:fixture
```

Use `npm run build` before a release check. Run `npm run db:down` to stop the local database.

## Documentation

- [Architecture](docs/architecture.md)
- [Database and persistence](docs/database.md)
- [Commands](docs/commands.md)
- [Testing](docs/testing.md)
- [Documentation index](docs/index.md)

## Data and security boundaries

- Project mutations require a signed, HTTP-only edit session.
- Provider identifiers, raw uploads, and API keys remain server-side.
- Course-model claims carry evidence references.
- Tutor versions and evaluation artifacts are immutable or append-only once persisted.
- Automated tests use mocked AI boundaries and do not make live OpenAI calls.
