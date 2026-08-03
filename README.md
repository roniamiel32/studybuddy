# StudyBuddy

Version **0.1.0** — design phase, no application code yet.

AI-assisted matchmaking that connects university students who share a course,
have overlapping free time, and study in compatible ways. Built as the final
project for the Full-Stack course at Reichman University.

**Authors:** Roni Amiel & Eden Bitran

---

## Status

| Area | State |
|---|---|
| Technical design | Done — [docs/technical-design.md](docs/technical-design.md) |
| Project scaffold | Not started (Phase 0.5) |
| Database & RLS | Not started (Phase 1) |
| Matching engine | Not started (Phase 2) |
| AI integration | Not started (Phase 3) |
| WhatsApp handoff | Not started (Phase 4) |

## Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Backend:** Supabase — PostgreSQL, Auth, Row Level Security
- **AI:** OpenAI / Gemini — match re-ranking and icebreaker generation
- **Deployment:** Vercel

## How it works

1. A student signs up with their university email; the mail domain determines
   which institution's data they can see.
2. Onboarding collects a learning-preference questionnaire, a weekly
   availability grid, and the courses they're taking this term.
3. Each course has its own dashboard listing candidate study partners,
   ranked by a deterministic SQL score and then re-ranked by AI.
4. Sending a request attaches an AI-written, personalised opener.
5. Once accepted, a WhatsApp deep link opens a real conversation with that
   opener already typed.

## Documentation

- [Technical Design Document](docs/technical-design.md) — schema, folder
  structure, backend surface, component tree, phased plan, risks
- [Commit convention](.claude/commit-convention.md)
- [Changelog](CHANGELOG.md)

## Versioning

Semantic versioning (`X.Y.Z`). The number currently lives in
[`VERSION`](VERSION) and moves into `package.json` when the Next.js app is
scaffolded. `1.0.0` marks the submitted project.
