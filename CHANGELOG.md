# Changelog

All notable changes to StudyBuddy. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-08-03

Phase 0.5 — project scaffold. The application now builds, runs and tests, but
implements no product features.

### Added
- Next.js 16.2.12 App Router project with React 19.2.4, TypeScript strict mode,
  Tailwind CSS 4 and ESLint. `src/` layout with the `@/*` import alias.
- shadcn/ui (4.16, on Base UI) with `Button`, `Card`, `Input`, `Label` and
  `Badge` as a starter set. Component source is copied into
  `src/components/ui/`, so there is no runtime UI dependency.
- `src/lib/env.ts` — zod-validated environment split into browser-safe and
  server-only halves. Names every offending variable in a single error;
  `serverEnv()` throws if called from a client bundle.
- `src/lib/supabase/{client,server,admin,middleware}.ts` — browser, request-
  scoped, service-role and session-refresh clients. `requireUser()` uses
  `getUser()` rather than `getSession()` so authorization never rests on an
  unvalidated JWT. `admin.ts` is marked `server-only` and documents the three
  operations permitted to bypass RLS.
- `src/lib/errors.ts` — the `ActionResult<T>` contract, `AppError`, and
  `toActionError()`, which reduces unexpected errors to a generic message while
  logging the detail server-side.
- Vitest (jsdom) and Playwright (chromium + mobile Safari) configured, with 23
  unit tests over the env validator and error contract, and a landing-page e2e
  smoke test.
- `supabase init` — local CLI config as `project_id = "studybuddy"`, plus the
  `migrations/` and `seed/` directories Phase 1a fills.
- `.env.example` documenting every variable, with local-CLI instructions.
- Landing page and root layout replacing the create-next-app default.
- `.claude/launch.json` so the dev server can be started by tooling.

### Changed
- Version now lives in `package.json`; the root `VERSION` file is deleted.
- `docs/technical-design.md` (0.1.2) reconciled with the scaffold as actually
  built: no `tailwind.config.ts` (Tailwind v4 is CSS-first), `vitest.config.mts`
  instead of `.ts`, shadcn/ui adopted and `components/ui/` exempted from the
  file-header convention, pinned versions table added, and the npm audit
  position recorded.
- `README.md` rewritten with setup instructions, a script table and the project
  layout.

### Notes
- `npm audit` reports three high-severity advisories in `postcss` and `sharp`,
  both transitive dependencies of `next@16.2.12`. npm's only offered fix is
  downgrading to `next@9`. Left in place; neither is reachable by untrusted
  input in this app.
- `AI_MODEL` deliberately has no default, so no model id is hardcoded in
  source. AI features report as unconfigured unless both a key and a model are
  set.

### Verification
`npm run lint`, `npm run typecheck`, `npm test` (23 passed), `npm run test:e2e`
(4 passed across chromium and mobile Safari) and `npm run build` all pass. The
dev server was loaded in a browser and the landing page confirmed rendering at
desktop and mobile widths.

## [0.1.1] — 2026-08-03

Documentation alignment. No code, no functional change.

### Added
- `docs/prd.md` — the SDD/PRD, previously held outside the repository, now
  version-controlled alongside the technical design.

### Changed
- **PRD §3: "Smart Interaction" renamed to "WhatsApp Handoff"** (PRD rev 1.1).
  The feature now states plainly that the AI-generated icebreaker is handed
  off into WhatsApp through a `wa.me` deep link, that no in-app chat is built,
  and that contact details are exchanged only after a request is accepted.
- PRD §5 Phase 4: "smart messaging feature" → "WhatsApp handoff feature".
- `docs/technical-design.md` §7 item 1 struck through and marked resolved —
  the PRD/design divergence it flagged no longer exists. Design doc header
  bumped to 0.1.1.
- `README.md` — PRD added to the documentation index.

## [0.1.0] — 2026-08-03

Initial commit. Design only — no application code.

### Added
- `docs/technical-design.md` — full technical design: PostgreSQL schema with
  enums, constraints, indexes, helper functions and an RLS policy matrix; the
  `rpc_find_candidates` scoring model; Next.js App Router folder structure;
  server-action and route-handler surface; React component tree; an
  eleven-step phased implementation plan; risk register.
- `README.md` — project overview, stack, status table.
- `CHANGELOG.md` — this file.
- `VERSION` — `0.1.0`. Placeholder until `package.json` exists (Phase 0.5).
- `.gitignore` — Node, Next.js, Supabase, macOS, test artefacts; blocks `.env`
  while allowing `.env.example`.
- `.claude/commit-convention.md` — commit title format
  `[vX.Y.Z] type(scope): summary`, body requirements, branching rules.

### Design decisions recorded
- Seeded course catalog with per-term `course_offerings`, rather than
  free-text course names.
- Connection model is a direct request with accept/decline, not mutual opt-in.
- No in-app chat: an AI-generated icebreaker is handed off to WhatsApp via a
  `wa.me` deep link. `profile_contacts` is a separate table so a phone number
  is unreadable until a request is accepted.
- AI runs as a re-ranker over a SQL prefilter, cached in `match_scores` with a
  24-hour TTL, and degrades to the deterministic ranking on failure.
- Multi-tenancy is row-level on `university_id`, asserted in both RLS policies
  and query predicates.
