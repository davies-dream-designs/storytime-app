# AGENTS.md — Repository rules for coding agents

This file documents the conventions, constraints, and workflow rules that all automated coding agents must follow when working in this repository.

---

## Memory Vault — do this first

Pull Jake's memory vault before starting any work:

```bash
git -C /home/openhands/jake-vault pull origin vault 2>/dev/null || \
  git clone "https://${GITHUB_TOKEN}@github.com/davies-dream-designs/claude-memory.git" \
  --branch vault /home/openhands/jake-vault
```

Read `/home/openhands/jake-vault/MEMORY.md` for project context and preferences. See `/home/openhands/AGENTS.md` for full global rules.

---

## Technology

- **Framework:** Next.js 15, App Router, TypeScript strict mode
- **Styles:** Tailwind CSS v4 — utility classes only, no custom CSS unless unavoidable
- **Tests:** Vitest + React Testing Library (unit), Playwright (e2e)
- **Linter:** ESLint (`next/core-web-vitals`, `next/typescript`)
- **Formatter:** Prettier (`.prettierrc`)

## Before finishing any task

Run every quality gate that applies:

```bash
npm run lint        # must exit 0
npm run typecheck   # must exit 0
npm test            # must exit 0
npm run build       # must exit 0
```

Never mark a task complete if any of these fail.

Always end the turn with an explicit completion/status response to the user. Do not stop after pushing code or deploying without clearly saying whether the requested work is finished, what remains, and what the user should verify next.

## File placement

| What | Where |
|---|---|
| App pages & layouts | `src/app/` |
| API route handlers | `src/app/api/<resource>/route.ts` |
| Unit tests | `src/tests/<name>.test.ts(x)` |
| E2E tests | `e2e/<name>.spec.ts` |
| Shared utilities | `src/lib/` (create directory if needed) |
| Shared components | `src/components/` (create directory if needed) |

## Code style

- No comments unless the reason is non-obvious.
- No `any` types — use explicit types or `unknown`.
- No `console.log` left in production code.
- Prefer Server Components; use `"use client"` only when interactivity requires it.
- Keep components small and focused; co-locate tests with the code they test.

## Git

- Never commit `.env`, `.env.local`, or any file containing real secrets.
- Never push directly to `main`.
- Always write a clear, imperative commit message (e.g. `add user profile page`).
- Work on one feature/fix PR at a time.
- Keep `dev.storycot.com` pointed at the current active feature/fix branch while that PR is in progress. When starting a new branch, update the Vercel project domain mapping for `dev.storycot.com` to that branch before handing the environment back.

## Adding dependencies

- Prefer packages that are actively maintained and have TypeScript types.
- Add to `devDependencies` if the package is only needed at build/test time.
- After adding a dependency, re-run `npm run build` to confirm it does not break the production build.

## Forbidden actions

- Do not modify `.github/workflows/ci.yml` unless the task explicitly requires it.
- Do not delete or weaken the `.gitignore` rules for environment files.
- Do not introduce secrets or hard-coded credentials.
- Do not disable ESLint rules with `eslint-disable` comments without a documented reason.
