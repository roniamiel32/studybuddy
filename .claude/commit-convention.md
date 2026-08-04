# Commit Convention — StudyBuddy

Applies to every commit in this repository, in this and all future sessions,
unless Roni changes it.

## Title format

**Current format, set by Roni on 2026-08-03 (supersedes the original below):**

```
Study-Buddy: Version - X.Y.Z
```

- `X.Y.Z` — the project version **as it stands after this commit**, matching
  `package.json`.
- Nothing else goes in the title. All detail — what changed, why, tradeoffs —
  belongs in the body, which stays as demanding as ever.

Examples:

```
Study-Buddy: Version - 0.4.0
Study-Buddy: Version - 0.5.0
```

Because the title no longer describes the change, **the body's first line
carries that weight** — open it with a one-sentence summary of what this
commit does before the detailed sections.

### Superseded format (commits v0.1.0 – v0.3.0)

The first four commits use Conventional Commits with a version prefix:

```
[vX.Y.Z] type(scope): summary
```

Left in the history as-is rather than rewritten. If Roni ever wants the log
uniform, that is a rebase, and it needs an explicit go-ahead.

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
