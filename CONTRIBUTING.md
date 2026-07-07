# Contributing to qrty

Thanks for your interest. qrty is a small, focused TypeScript CLI; contributions
that keep it that way are welcome.

## The flow

1. **Open an issue first.** Describe the problem — a bug with steps to reproduce,
   or a concrete use case a feature would serve. This lets us agree on scope
   before anyone writes code.
2. **Cure it with a pull request.** Reference the issue, keep the change focused,
   and include tests. One concern per PR.

## Development setup

Requirements: **Node.js ≥ 23.6** (qrty runs the TypeScript sources directly via
native type-stripping — no build step). PNG output and `--restyle` need the
native `canvas` module, installed automatically as an optional dependency; on
Linux it needs the cairo/pango system libraries (see the CI workflow for the
exact packages).

```
npm ci
npm test            # node:test suite
npm run typecheck   # tsc, no emit
```

Enable the secret-scanning pre-commit hook once after cloning:

```
git config core.hooksPath .githooks
```

This runs `gitleaks` over your staged changes before each commit and blocks the
commit if it finds a secret. Install gitleaks first (`brew install gitleaks`).

## Standards

- **Tests are required.** New behavior and bug fixes ship with a test; we work
  test-first (write the failing test, then the code). `npm test` must be green.
- **Typecheck must pass.** `npm run typecheck` clean — `strict` is on, and unused
  locals/parameters are errors.
- **Keep it small.** Prefer the simpler option; match the surrounding style.
- **Commits.** Present-tense, scoped subject lines (e.g. `fix(recolor): …`).

## Reporting security issues

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).
