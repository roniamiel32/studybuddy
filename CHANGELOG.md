# Changelog

All notable changes to StudyBuddy. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-08-03

Phase 1a — database schema. The schema exists, is seeded, and is completely
inaccessible to clients until the Phase 1b policies land.

### Added
- Nine migrations under `supabase/migrations/`: enum types, tenancy roots,
  profiles/contacts/preferences, the academic catalog and availability,
  connection requests and blocks, the AI cache and generation log, helper
  functions and triggers, RLS enablement, and the Data API grants.
- 14 tables, 12 enum types, 12 triggers and 3 helper functions.
- Seed data for two universities. Reichman is the rollout target; Tel Aviv
  exists so the Phase 1b RLS tests have a real cross-tenant boundary to attack,
  and both offer a course of the same name as a leakage tripwire. Reichman has
  a past and a current term so the term dimension is actually exercised.
- 20 schema integration tests covering tenant resolution at signup, the
  denormalised `university_id` triggers, the unordered-pair request constraint,
  the availability overlap function, and the E.164 phone check. They skip with
  a warning when the local stack is not configured.
- `scripts/gen-types.mjs`, so regenerating database types preserves the file
  header instead of stripping it.

### Changed — decision D7, hybrid availability
- Availability may be entered manually **or** derived from a connected
  calendar. `availability_source` and `availability_mode` enums,
  `availability_slots.source` and `profiles.availability_mode` ship now, with
  safe defaults, so no backfill is needed when the sync itself is built.
- `source` is part of the uniqueness constraint on `availability_slots`, so a
  calendar resync replaces only its own rows and never discards hand-added
  slots.
- Design doc gains §1.4.1 (input modes and the `calendar_connections` sketch),
  roadmap Phase 4c, and §6.6 covering the risks.
- PRD to rev 1.2: Smart Onboarding now describes both input paths.

### Changed — schema corrections found while building
- `profiles.full_name` is nullable. The row is created by a trigger the moment
  the auth user exists, which is before the student has entered a name.
  Inventing one from the email address was the alternative, and it is worse.
- `app_are_connected(a, b)` became `app_is_connected_to(other)`. The
  two-argument form let any authenticated user probe whether two strangers were
  connected; the new form derives the caller from `auth.uid()`.
- Every function pins an empty `search_path` and fully qualifies its
  references, closing the privilege-escalation path a `SECURITY DEFINER`
  function with a mutable search path would leave open.
- `connection_requests` gained a trigger asserting both parties belong to the
  offering's university, making a cross-institution request impossible at the
  storage layer regardless of application code.
- ESLint now ignores `supabase/.temp/`, the generated types, and test
  artefacts; the Supabase CLI cache contains a minified bundle that produced
  ~150 spurious errors.
- `rpc_find_candidates` deferred to Phase 2, where it is the deliverable and
  can be tested against real student data.

### Notes
- **Course codes in the seed are placeholders.** The course names are real Efi
  Arazi School subjects; the codes were invented. Replace them from the
  official course list before submission — only
  `supabase/seed/02_course_catalog.sql` needs changing. Lecturer is left NULL
  rather than populated with invented names.
- Explicit `GRANT`s were required: Supabase no longer auto-exposes new
  public-schema objects, and the legacy opt-out is removed on 2026-10-30.
  Access now needs both a grant and an RLS policy.

### Verification
`npm run verify` passes: lint, typecheck, 43 tests (23 unit + 20 integration),
production build. `supabase db reset` applies all nine migrations and both
seeds cleanly from scratch.

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
