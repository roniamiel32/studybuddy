# Changelog

All notable changes to StudyBuddy. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
