# Storycot — Handover Document

> Auto-maintained by the `update-handover` skill. Run `/update-handover` after any significant changes.

**Last updated:** 2026-07-16  
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
```

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
7. **OpenAI image rate limits** — `feat/print-book-preview` currently hits OpenAI's 5 images/min limit under multi-user load. Retry logic exists but the architectural fix (Inngest + OpenAI Batch API) is the agreed next step — not yet built.

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

### Key files
| File | Purpose |
|---|---|
| `src/lib/print-books/pdf.ts` | PDF renderer — cover, interior, frontispiece, page layout |
| `src/lib/print-books/illustrations.ts` | OpenAI image gen, placeholder SVGs, rate limit handling |
| `src/lib/print-books/jobs.ts` | Book build job pipeline (`processBookBuildJob`, `enqueueBookBuildJob`) |
| `src/app/api/books/[id]/build/route.ts` | Build trigger API route |
| `src/app/api/book-jobs/[jobId]/run/route.ts` | Job step runner |
| `src/types/printBook.ts` | `BookSpread`, `BookProject`, `BookBuildJob` types |

### Agreed next step — Inngest + OpenAI Batch API
Replace `after()` chains with **Inngest** (proper job queue, rate limiting, concurrency control) and replace per-image OpenAI calls with **OpenAI Batch API** (`/v1/images/generations` is supported, 50% discount, no per-minute limits).

**Flow:** Build triggers → Inngest job → planning/bible/spreads compose → submit ALL images as one OpenAI batch → Inngest polls for batch completion → images stored → PDFs generated → book ready.

**Start here in new session:**
1. Install `inngest` + `@inngest/next`
2. Create Inngest client and Next.js serve handler at `src/app/api/inngest/route.ts`
3. Migrate `regenerateProjectArt` into an Inngest function with concurrency limits
4. Replace per-image OpenAI calls with a batch submission function
5. Add Inngest polling loop for batch completion

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
