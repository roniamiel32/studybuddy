# StudyBuddy

Version **0.2.0** — scaffold complete, no features yet.

AI-assisted matchmaking that connects university students who share a course,
have overlapping free time, and study in compatible ways. Built as the final
project for the Full-Stack course at Reichman University.

**Authors:** Roni Amiel & Eden Bitran

---

## Status

| Phase | Area | State |
|---|---|---|
| 0 | Technical design | ✅ [docs/technical-design.md](docs/technical-design.md) |
| 0.5 | Project scaffold | ✅ Next.js, Tailwind, shadcn/ui, Supabase clients, test stack |
| 1 | Database schema & RLS | ⬜ Not started |
| 1c | Auth & onboarding | ⬜ Not started |
| 2 | Rule-based matching | ⬜ Not started |
| 3 | AI re-rank & icebreaker | ⬜ Not started |
| 4 | WhatsApp handoff & polish | ⬜ Not started |

## Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4,
  shadcn/ui
- **Backend:** Supabase — PostgreSQL, Auth, Row Level Security
- **AI:** OpenAI / Gemini — match re-ranking and icebreaker generation
- **Testing:** Vitest + Testing Library (unit/integration), Playwright (e2e)
- **Deployment:** Vercel

## Getting started

Requires Node 20.9+ and Docker Desktop (for the local Supabase stack).

```bash
npm install
cp .env.example .env.local
```

Start the local database and copy the printed API URL and keys into
`.env.local`:

```bash
npm run db:start
```

Then run the app:

```bash
npm run dev
```

The landing page is at http://localhost:3000. Until Phase 1c lands there is no
auth, so the app runs without Supabase configured — but `npm run db:start` is
needed from Phase 1a onward.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright end-to-end tests (starts the dev server itself) |
| `npm run verify` | lint + typecheck + test + build, in that order |
| `npm run db:start` / `db:stop` | Local Supabase stack |
| `npm run db:reset` | Drop, re-run all migrations, re-seed |
| `npm run gen:types` | Regenerate `src/types/database.types.ts` from the live schema |

Run `npm run verify` before every commit — it is the definition of "done" for
this project.

## How it works

1. A student signs up with their university email; the mail domain determines
   which institution's data they can see.
2. Onboarding collects a learning-preference questionnaire, a weekly
   availability grid, and the courses they're taking this term.
3. Each course has its own dashboard listing candidate study partners, ranked
   by a deterministic SQL score and then re-ranked by AI.
4. Sending a request attaches an AI-written, personalised opener.
5. Once accepted, a WhatsApp deep link opens a real conversation with that
   opener already typed.

## Project layout

```
docs/         Design documents — read technical-design.md first
src/app/      Next.js App Router routes
src/features/ Domain behaviour: server actions, queries, validation schemas
src/components/  Rendering only — never talks to Supabase directly
src/lib/      Domain-free infrastructure (env, Supabase clients, errors)
supabase/     Migrations, seeds, local CLI config
tests/        unit + integration (Vitest), e2e (Playwright)
```

Files under `src/components/ui/` are shadcn/ui source, added with
`npx shadcn@latest add <name>`. They are third-party-authored and so are the
one place that does not carry our file-header convention.

## Documentation

- [Software Design Document (PRD)](docs/prd.md) — product scope, core
  features, business value, phased workflow
- [Technical Design Document](docs/technical-design.md) — schema, folder
  structure, backend surface, component tree, phased plan, risks
- [Commit convention](.claude/commit-convention.md)
- [Changelog](CHANGELOG.md)

## Versioning

Semantic versioning (`X.Y.Z`), tracked in `package.json`. `1.0.0` marks the
submitted project.
