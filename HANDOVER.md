# Storycot — Handover Document

> Auto-maintained by the `update-handover` skill. Run `/update-handover` after any significant changes.

**Last updated:** 2026-07-16 (evening)  
**Branch:** main  
**Live URL:** https://storycot.com  
**Active feature branch:** `feat/print-book-preview` — print book MVP (not yet merged to main)

---

## Project Overview

Storycot is an AI-powered personalised bedtime story generator. Parents/grandparents create child profiles, pick a theme, and Claude generates a unique 700–900 word story in seconds. Stories are saved, readable, printable, and shareable.

**Target audience:** Parents and grandparents of young children (0–8 years), globally.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 (CSS variable config) |
| Auth | Clerk v7 (`@clerk/nextjs`) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) |
| Database | Vercel KV (Redis) |
| Payments | Stripe (one-time credit packs) |
| Hosting | Vercel |
| i18n | next-intl 3.x (path-based: `/en/`, `/es/`, `/fr/`, `/zh/`) |
| Testing | Playwright (E2E), Vitest (unit) |

---

## Repository

- **GitHub:** `davies-dream-designs/storytime-app`
- **Main branch:** `main` — auto-deploys to storycot.com via Vercel
- **Dev workflow:** feature branch → PR → merge to main

---

## Environment Variables

Required in Vercel (Production) and `.env.local` (dev):

```
# Clerk — use pk_test_/sk_test_ for dev, pk_live_/sk_live_ for prod
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Clerk redirect URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Anthropic
ANTHROPIC_API_KEY=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=              # rk_live_ restricted key only — never sk_live_
STRIPE_WEBHOOK_SECRET=

# Vercel KV (auto-injected by Vercel when KV database is linked)
KV_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=

# App
NEXT_PUBLIC_APP_URL=https://storycot.com

# E2E testing only
E2E_CLERK_USER_ID=
E2E_BASE_URL=
VERCEL_AUTOMATION_BYPASS_SECRET=

# Print book — Inngest job queue (opt-in via BOOK_PIPELINE_DRIVER=inngest)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
BOOK_PIPELINE_DRIVER=       # set to "inngest" to use durable queue; omit to keep after() default
```

### Pulling env vars locally

OpenHands has `VERCEL_PAT_TOKEN` in secrets (not `VERCEL_TOKEN`). Use:

```bash
VERCEL_TOKEN=$VERCEL_PAT_TOKEN vercel env pull .env.local --yes
```

Run this at the start of each session in the active worktree. Both workspaces are already linked to `davies-dream-designs/storytime-app`.

---

## Key Directory Structure

```
src/
├── app/
│   ├── [locale]/               # All user-facing pages (i18n)
│   │   ├── layout.tsx          # Root locale layout — ClerkProvider, NextIntlClientProvider
│   │   ├── page.tsx            # Landing page
│   │   ├── dashboard/          # Home dashboard with stats + story generator
│   │   ├── profiles/           # Child profiles list + new/edit/detail
│   │   ├── stories/            # Story library + new story wizard + reader
│   │   ├── account/            # Credits, top-up packs, referral share
│   │   ├── s/[token]/          # Public shared story page (no auth)
│   │   ├── sign-in/            # Clerk hosted sign-in
│   │   └── sign-up/            # Clerk hosted sign-up
│   ├── api/
│   │   ├── stories/generate/   # POST — AI story generation
│   │   ├── stories/suggest/    # POST — AI story idea suggestions (cached in KV)
│   │   ├── stories/[id]/share/ # POST — generate share token
│   │   ├── profiles/           # GET/POST child profiles
│   │   ├── characters/         # GET/POST character memory
│   │   ├── stripe/checkout/    # POST — create Stripe checkout session
│   │   ├── stripe/webhook/     # POST — Stripe webhook (credit top-up)
│   │   └── referral/redeem/    # POST — redeem referral credit
│   └── layout.tsx              # Minimal root layout (html shell only)
├── components/
│   ├── Nav.tsx                 # Sticky app nav (auth-aware, i18n, language switcher)
│   ├── LanguageSwitcher.tsx    # Globe icon + custom dropdown (light/dark variant)
│   ├── StoryLibrary.tsx        # Story grid with search/filter
│   ├── DashboardGreeting.tsx   # Time-aware greeting (client)
│   ├── ShareSection.tsx        # Referral link share widget
│   └── RefCapture.tsx          # URL ref param capture on landing
├── i18n/
│   ├── routing.ts              # Locale list: ['en','es','fr','zh']
│   ├── navigation.ts           # Locale-aware Link, useRouter, usePathname
│   └── request.ts              # next-intl server config
├── lib/
│   ├── db.ts                   # KV database abstraction (profiles, stories, characters)
│   └── storyGenerator.ts       # Claude API calls — generateStory + generateSuggestions
├── middleware.ts               # Clerk + next-intl combined middleware
└── types/index.ts              # Shared types (ChildProfile, Story, etc.)
messages/
├── en.json                     # English translations (source of truth)
├── es.json                     # Spanish
├── fr.json                     # French
└── zh.json                     # Mandarin Chinese
```

---

## Core Features

### Authentication
- Clerk v7 with email + Google OAuth (production)
- Facebook OAuth — enabled, needs App Review for email scope
- Apple OAuth — enabled but no credentials yet (skip for now — complex setup)
- Middleware: `src/middleware.ts` — intl redirect runs BEFORE auth.protect() to prevent sign-in loop

### Credits System
- New users get 3 free credits (set via Clerk `privateMetadata.credits`)
- Admin users (`privateMetadata.isAdmin = true`) get unlimited
- Stripe credit packs: top up via one-time payment
- Webhook at `/api/stripe/webhook` increments credits on `checkout.session.completed`
- **Stripe key rule:** Only use `rk_live_` restricted key in `STRIPE_SECRET_KEY`, never `sk_live_`

### Story Generation
- Model: `claude-sonnet-4-6`
- Prompt: `src/lib/storyGenerator.ts` — `buildStoryPrompt()`
- Language: passed via `locale` param — Claude writes in EN/ES/FR/ZH
- Suggestions cached in KV: key = `suggestions:{profileId}:{locale}` (24hr TTL)
- Story content stored as-is in the language it was generated — no translation after the fact

### Multilingual (i18n)
- Path-based routing: `/en/`, `/es/`, `/fr/`, `/zh/`
- All UI strings in `messages/*.json`
- Translation namespaces: `nav`, `home`, `dashboard`, `profiles`, `stories`, `account`, `share`, `common`
- `home.themes` keys used for both landing page badges and story card theme labels
- Theme slugs stored in DB as English lowercase (e.g. `"bravery"`) — mapped to `tKey` in `THEME_CONFIG`

### Sharing
- Story share: POST `/api/stories/[id]/share` → generates a token stored in KV
- Share URL: `storycot.com/[locale]/s/[token]` — publicly accessible, no auth
- Share page UI translates to viewer's locale; story content stays in generation language

---

## Clerk Dashboard Settings

**Production instance** — `dashboard.clerk.com` → Production

### Colors (Configure → Customization → Colors)
| Setting | Value |
|---|---|
| Light mode primary | `#fbbf24` |
| Light mode background | `#faf9f6` |
| Dark mode primary | `#fbbf24` |
| Dark mode background | `#1a1526` |

### SSO Connections (Configure → SSO connections)
| Provider | Status | Notes |
|---|---|---|
| Google | ✅ Configured | Redirect URI: `https://clerk.storycot.com/v1/oauth_callback` |
| Facebook | ⚠️ Needs App Review | App ID/Secret entered; email scope pending Meta review |
| Apple | ❌ Not set up | Needs Apple Developer account — skip for now |

### Avatar
- Background: Marble, color `#5b4e8a` (star purple)
- Foreground: Initials, white

### Redirect URLs
- Sign-in: `/sign-in`
- Sign-up: `/sign-up`
- After sign-in: `/dashboard`
- After sign-up: `/dashboard`

---

## Known Issues / Gotchas

1. **Clerk production `0/3 setup tasks`** — Domain DNS setup for `clerk.storycot.com` still needs completing. Until done, production auth won't fully work.
2. **Facebook OAuth App Review** — FB requires review before `email` scope works for non-test users. Submit in Meta Developer Console.
3. **storycot.com.au domain** — Issue #9 open. Not set up yet.
4. **Stripe live/restricted key** — `STRIPE_SECRET_KEY` must be `rk_live_*` (restricted), never `sk_live_*`.
5. **KV → Postgres migration** — Issue #6. Currently all data is in Vercel KV (Redis). No SQL, no relational queries. Long-term plan to move to Postgres for better querying.
6. **Existing stories are English** — Stories generated before multilingual was deployed are stored in English. No migration path — generate new ones in the desired language.
7. **OpenAI image rate limits** — Inngest `concurrency: 1` fix is built and opt-in on `feat/print-book-preview`. Activate via `BOOK_PIPELINE_DRIVER=inngest` in Vercel. OpenAI Batch API (50% cheaper, async) is the optional next layer — not yet built.

---

## Print Book Feature (`feat/print-book-preview`)

**Worktree:** `/home/openhands/workspaces/storycot-printbook-preview`  
**Status:** All committed and pushed. Not yet merged to main.

### What's built
- Lulu 8.5"×8.5" square hardcover spec PDF generation (cover + interior, 630×630pt pages)
- Per-page 1024×1024 square illustrations (`leftPageImageUrl` + `rightPageImageUrl` per spread, replaces shared landscape)
- 8-direction black text outline on story text + page numbers for readability over illustrations
- Step-by-step build pipeline: `BookBuildJob` with `artGenerationCursor`, chained via Next.js `after()`
- 429 retry with wait time parsed from OpenAI error body; sequential (not parallel) image gen per spread
- Moderation-blocked images retry without page text before failing
- Story page shows "View print book" button once a book exists (translation key fixed)
- **Final pages fixed:** page 31 = centred "The End" leaf on BRAND_PURPLE; page 32 = centred "Sweet dreams." colophon (was misaligned + placeholder)
- **Back cover art fixed:** generated "Back Cover" spread image now renders full-bleed on the physical back cover panel with a paper scrim for blurb legibility
- **Inngest pipeline (opt-in):** durable `build-book` function with `concurrency: 1` registered at `/api/inngest`; build route sends event when `BOOK_PIPELINE_DRIVER=inngest`, otherwise keeps existing `after()` — nothing changes in prod until the env var is set

### Key files
| File | Purpose |
|---|---|
| `src/lib/print-books/pdf.ts` | PDF renderer — cover, interior, frontispiece, page layout |
| `src/lib/print-books/illustrations.ts` | OpenAI image gen, placeholder SVGs, rate limit handling |
| `src/lib/print-books/jobs.ts` | Book build job pipeline (`processBookBuildJob`, `enqueueBookBuildJob`) |
| `src/app/api/books/[id]/build/route.ts` | Build trigger — sends Inngest event or falls back to `after()` |
| `src/app/api/book-jobs/[jobId]/run/route.ts` | Job step runner |
| `src/lib/inngest/client.ts` | Inngest client + `INNGEST_EVENTS` constants |
| `src/lib/inngest/functions.ts` | `buildBook` function — `concurrency: 1`, advances job state machine |
| `src/app/api/inngest/route.ts` | Inngest sync/execute endpoint (GET/POST/PUT) |
| `src/types/printBook.ts` | `BookSpread`, `BookProject`, `BookBuildJob` types |

### Inngest integration — status

Steps 1–3 are **done**:
- ✅ `inngest` installed (v4.13.0, `--legacy-peer-deps` required due to optional `@sveltejs/kit` peer)
- ✅ Client at `src/lib/inngest/client.ts`, serve handler at `src/app/api/inngest/route.ts`
- ✅ `buildBook` function: `concurrency: { limit: 1 }` — serialises builds account-wide, naturally throttles OpenAI image calls without Batch API
- ✅ Build route wired: sends `storycot/book.build.requested` event when `BOOK_PIPELINE_DRIVER=inngest`

**Still to do (steps 4–5):**

Option (a) — throttle only (recommended, no UX change): add `step.sleep` inside the advance loop to pace image generation, stay synchronous.

Option (b) — full Batch API (50% cheaper, books take up to 24h): replace per-image calls in `illustrations.ts` with a batch submit + Inngest polling loop for `GET /v1/batches/{id}`.

Jake hasn't chosen yet. Default to option (a) unless told otherwise.

**To activate in prod:** set `BOOK_PIPELINE_DRIVER=inngest`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` in Vercel env vars and point Inngest Cloud at `https://storycot.com/api/inngest`.

**Install note:** always use `--legacy-peer-deps` for this repo — inngest has an optional peer on `@sveltejs/kit` that npm can't resolve otherwise. Also ensure `@testing-library/dom` stays in devDependencies or tests break.

---

## Open GitHub Issues

| # | Title | Priority |
|---|---|---|
| #13 | Stripe test/live key separation | High |
| #25 | Print book: age-based layout variations | Future |
| #24 | Print book: per-page square illustrations — **done on `feat/print-book-preview`**, not merged | Done/pending merge |
| #11 | Phase 5: Multilingual support — full UI + story localisation | Future |
| #9 | storycot.com.au domain redirect | Medium |
| #6 | Migrate KV → Postgres | Low (future) |
| #4 | Print-on-demand physical books (Lulu integration) | Future |
| #3 | Phase 4: AI illustration generation per story page | Future |
| #2 | Phase 3: Voice narration / audio playback | Future |

---

## Deployment

- **Vercel project:** `storytime-app`
- Auto-deploys on push to `main`
- Preview deployments on PRs
- Environment variables set in Vercel dashboard (Production + Preview separately)
- E2E tests: Playwright via `npm run test:e2e` — requires `VERCEL_AUTOMATION_BYPASS_SECRET`

---

## Fonts

- **Display** (`font-display`): Fredoka — used for headings, titles, logo
- **Body** (`font-body`): Nunito — used for all body text

---

## Agent / AI Context

This project uses Claude Code for development. The Codex agent is connected via AgentHub. Run `/update-handover` after any significant changes to keep this document current.

Support email: `hello@storycot.com` (forwards to `hello@daviesdreamdesigns.com`)  
Owner: Jake Davies — NCS Australia / Davies Dream Designs, Noarlunga Centre SA
