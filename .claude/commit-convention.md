# Commit Convention — StudyBuddy

Recorded on 2026-08-03. Applies to every commit in this repository, in this
and all future sessions, unless Roni changes it.

## Title format

```
[vX.Y.Z] type(scope): summary
```

- `vX.Y.Z` — the project version **as it stands after this commit** (see
  `VERSION`, later `package.json`).
- `type` — one of: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`,
  `perf`, `style`, `build`, `ci`.
- `scope` — the affected area. Established scopes:
  `auth`, `profile`, `prefs`, `availability`, `courses`, `enrollment`,
  `matching`, `ai`, `requests`, `handoff`, `db`, `rls`, `ui`, `docs`,
  `deps`, `config`.
- `summary` — imperative mood, lowercase, no trailing period, ≤ 60 chars
  including the version prefix where possible.

Examples:

```
[v0.2.0] feat(matching): add SQL prefilter RPC for course candidates
[v0.2.1] fix(rls): stop contact phone leaking to non-accepted partners
[v0.1.1] docs(db): correct FK direction in schema diagram
```

## Body

Always detailed — never a single line. Must cover:

1. **What changed** — per file or per logical area.
2. **Why** — the reason the change was needed.
3. **Tradeoffs / alternatives rejected**, where any existed.
4. **Version bump** — if the version changed, state `0.1.0 -> 0.2.0` and
   why that level (major = breaking, minor = new backward-compatible
   functionality, patch = bug fix with no API change).
5. **Testing** — what was run and the result.

## Authorship

- Author: the local git identity (`roniamiel32 <roni.amiel@post.runi.ac.il>`).
- File headers credit `Roni Amiel & Eden Bitran`.
- **No** `Co-Authored-By: Claude`, no "Generated with Claude Code" footer,
  no AI attribution of any kind, ever.

## Branching

- Bootstrap/initial commit: `main`.
- All later work: `feature/<slug>`, `fix/<slug>`, `chore/<slug>`, branched
  off `main`.
- Never merge or push to `main` without Roni's explicit go-ahead in that
  specific instance.
