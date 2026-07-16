# Storycot — Handover Document

> Auto-maintained by the `update-handover` skill. Run `/update-handover` after any significant changes.

**Last updated:** 2026-07-16  
**Branch:** `feat/print-book-preview`  
**Live URL:** https://storycot.com  
**Preview:** https://dev.storycot.com  
**Latest deployed commit:** `3a6474c fix: return checkout to current origin`

---

## Current Branch Handoff — 2026-07-16

The active work is on `feat/print-book-preview`, pushed to GitHub and deployed to the Vercel preview alias `https://dev.storycot.com`.

### What Changed Recently

- Simplified illustrated book flow: users now work from the story/book pages instead of a heavy review/export flow.
- Added illustrated book PDF and EPUB exports, plus text-only EPUB export for stories.
- Improved Kindle usability:
  - Text EPUBs include cleaner metadata/title handling.
  - Text EPUB cover output was polished away from placeholder-style artwork.
  - EPUB download copy now makes it clearer the downloaded file should be shared/opened in Kindle.
- Hardened illustrated build failures:
  - Incomplete/placeholder art batches now fail instead of shipping broken placeholder pages.
  - Book status supports repair/retry states.
- Added story/book deletion:
  - Story deletion cascades to related book projects.
  - Book deletion removes related Vercel Blob assets before deleting KV records.
  - Delete controls exist on story/book detail pages and list pages.
- Added global interaction polish:
  - Buttons/links have press/hover/focus feedback.
  - Account credit pack buttons show disabled state when AU confirmation is not ticked.
  - Active nav item is visually indicated.
  - Global pending overlay appears for navigation, checkout, deletion, downloads, etc.
  - Pending overlay now uses the bouncing Storycot icon from the home page and shows only the current action label.
- Fixed Stripe Checkout return URLs:
  - Checkout success/cancel now derive from the current request origin and locale.
  - This prevents backing out of payment on `dev.storycot.com` returning to production.

### Latest Commits On Branch

```
3a6474c fix: return checkout to current origin
51e7e74 fix: use animated logo for pending overlay
3922f36 fix: simplify pending overlay text
54e9aa8 fix: improve list delete controls and buttons
816a5c1 fix: center global pending overlay
8f29219 fix: delete book blobs with book records
a86d0c3 feat: add story and book deletion
8e63576 feat: add global pending loader
8d7b400 fix: improve app interaction feedback
e3e8ef9 fix: polish text epub covers
b027998 fix: fail incomplete book art batches
fe50fdc improve epub kindle usability
1196692 clarify credit usage on account page
2b96f3d add text epub and resilient book downloads
7c2f75f add epub export for illustrated books
ff22958 simplify illustrated pdf flow
```

### Verified Before Handoff

Latest full verification after checkout fix:

```
npm run typecheck
npm test
npm run lint
```

All passed. Vercel preview deployment for `3a6474c` is Ready and aliased to `https://dev.storycot.com`.

### Important Files Added/Changed

- `src/app/api/stripe/checkout/route.ts`
  - Builds Stripe success/cancel URLs from current request origin and locale instead of blindly trusting `NEXT_PUBLIC_APP_URL`.
- `src/tests/stripe-checkout.test.ts`
  - Regression test proving dev checkout returns to `https://dev.storycot.com/en/account`.
- `src/components/GlobalPending.tsx`
  - Global pending overlay provider and animated icon loader.
- `src/app/globals.css`
  - Global interaction animation and shared `.storycot-btn` button system.
- `src/components/DeleteStoryButton.tsx`
  - Shared story delete client component.
- `src/components/DeleteBookButton.tsx`
  - Shared book delete client component.
- `src/components/StoryLibrary.tsx`
  - Story cards are now articles with explicit Read/Delete actions.
- `src/app/[locale]/books/page.tsx`
  - Book cards now have explicit View/Delete actions.
- `src/lib/db.ts`
  - Story delete cascades to related book projects.
- `src/lib/print-books/storage.ts`
  - Book asset collection/deletion helpers for Vercel Blob cleanup.

### Product Direction Captured In Conversation

- Credit model should move away from “1 story = 1 credit” once illustrated books are paid:
  - Plain text story: low credit cost.
  - Illustrated PDF/EPUB: higher credit cost because image generation has real cost.
  - Hardcover should likely stay product-priced rather than credit-priced because print/shipping/margins vary.
- Main desired customer flow:
  - Generate/read plain story.
  - Download plain PDF/EPUB.
  - Generate illustrated PDF/EPUB.
  - If they love it, create/order hardcover from the illustrated output.
- Avoid overbuilding review/regenerate/export pages for now. Keep the UX simple and resilient.
- Queues/builds should handle errors gracefully. Payment should not consume paid value permanently if build output fails.

### Known Follow-Ups / Risks

- Pricing enforcement is not fully implemented yet. Account copy explains credit usage, but the backend still needs final charging rules for illustrated generation.
- If illustrated generation takes payment/credits, implement an idempotent reservation/refund or “charge on successful artifact” model. Do not permanently burn credits on failed queues.
- Validate a real Stripe Checkout cancel in dev after the `3a6474c` deployment.
- The shared `.storycot-btn` system has been applied to the main current surfaces, but older profile/new-story buttons still use one-off Tailwind classes and may need a broader pass.
- Book deletion deletes Vercel Blob URLs it can collect from book project assets. If future assets are added, update `collectBookAssetUrls`.
- Preexisting stories/books may still have inline fallback export data or old assets. The UI hides customer-facing downloads when stored PDFs are unavailable.
- Inngest/OpenAI batch ingest env vars were synced earlier, but if builds degrade again, check Vercel env and the ingest provider status first.

---

## Project Overview

Storycot is an AI-powered personalised bedtime story generator. Parents/grandparents create child profiles, pick a theme, and Claude generates a unique 700–900 word story in seconds. Stories are saved, readable, printable, shareable, and can now be turned into illustrated book exports.

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

---

## Open GitHub Issues

| # | Title | Priority |
|---|---|---|
| #13 | Stripe test/live key separation | High |
| #9 | storycot.com.au domain redirect | Medium |
| #6 | Migrate KV → Postgres | Low (future) |
| #4 | Print-on-demand physical books | Future |
| #3 | AI illustrations per page | Future |
| #2 | Voice narration | Future |

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
