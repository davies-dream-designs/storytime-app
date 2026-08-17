# AGENTS.md — Repository rules for coding agents

This file documents the conventions, constraints, and workflow rules that all automated coding agents must follow when working in this repository.

---

## Memory Vault — do this first

Pull Jake's memory vault before starting any work:

```bash
git -C /home/openhands/jake-vault pull origin vault 2>/dev/null || \
  git clone "https://${GITHUB_TOKEN}@github.com/davies-dream-designs/claude-memory.git" \
  --branch vault /home/openhands/jake-vault && \
  cd /home/openhands/jake-vault && \
  git config user.email "hello@daviesdreamdesigns.com" && \
  git config user.name "Jake Davies"
```

Then read in order:
1. `/home/openhands/jake-vault/MEMORY.md` — full index
2. `/home/openhands/jake-vault/Inbox.md` — tasks + any WIP handoff from previous session
3. `/home/openhands/jake-vault/projects/storytime-app.md` — project context

**Inbox rules:**
- **WIP section** — mid-task handoff from a previous agent. Pick it up and continue.
- **Requested this session** — tasks Jake mentioned in chat. Add any new ones Jake mentions. Clear when shipped.
- **Jake's notes** — instructions from Jake. Act and clear.

**At end of session:**
- Write `Daily Notes/YYYY-MM-DD.md` with what was shipped (bullets only)
- Update `projects/storytime-app.md` if state changed
- Clear completed items from Inbox
- Push vault: `cd /home/openhands/jake-vault && git add -A && git commit -m "memory: <desc>" && git push origin vault`

**Daily notes are mandatory:**
- At the start of any meaningful Storycot work, open or create today's `Daily Notes/YYYY-MM-DD.md` in the Obsidian vault so the session has a running log.
- Before the final response, update that same daily note with shipped work, verification, pushes/deployments, and blockers.
- Do this even for small cleanup/refactor sessions; project notes are not a substitute for the daily note.

**Context running low / switching models:**
- Write current WIP to Inbox under "WIP — pick up here next session"
- Update project note + write daily note + push
- Tell Jake it's safe to start a new session

See `/home/openhands/AGENTS.md` for full global rules.

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

## Story-generation consistency gotcha

- Persisted `story.storyPersonIds` can contain both saved `storyPeople` IDs and synthetic child-cast IDs like `child:<profileId>`.
- Any route or job that reloads selected cast from a stored story must use `getSelectedStoryPeople(...)`, not `db.storyPeople.getByIds(...)` directly, or sibling/child-profile cast members will disappear during stream regeneration and book builds.
- For later print-book spreads, use approved cover art plus prior interior spread art only as optional continuity references; they should preserve recurring likeness/outfit/prop/location continuity, but must never override the current story moment or latest selected-cast appearance text.
- Generated spread art now stores `leftPageQa`/`rightPageQa` metadata with the character reference IDs, continuity reference labels, snapshot key, and fallback flags so spread-review tooling can inspect what conditioning was used.
