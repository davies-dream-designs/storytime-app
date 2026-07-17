# Storycot - Handover Document

**Last updated:** 2026-07-17  
**Branch:** `main`  
**Live URL:** https://storycot.com  
**Preview URL:** https://dev.storycot.com  
**Latest production merge:** `c1f56bc Merge pull request #27 from davies-dream-designs/feat/ui-consistency-pass`

---

## Current Handoff - 2026-07-17 - Story Streaming + Locale Expansion

Local `dev` has been pushed through `origin/dev` at `ca5109f`.

### What Changed

- Story generation UX:
  - New story submission now creates a `generating` story shell via `POST /api/stories/start`.
  - The user is navigated directly to `/[locale]/stories/[id]`.
  - The story page calls `POST /api/stories/[id]/stream` and renders page text as model output streams.
  - Final structured story pages are saved back to the same story record and normal share/print/book actions unlock when `status` becomes `ready`.
  - Legacy provider-specific waiting copy was replaced with provider-neutral “weaving” copy.
- Locale expansion:
  - Added Japanese (`ja`), Russian (`ru`), Indonesian (`id`), Turkish (`tr`), and Polish (`pl`).
  - Each new locale includes `messages/*.json`, centralized locale metadata, Stripe Checkout locale mapping, Clerk localization mapping, date locale, and story-generation language mapping.
  - Korean was not included because Stripe Checkout locale types in this repo do not list `ko`; the selected five are supported by both Clerk localizations and Stripe Checkout.

### Dev Pushes

- `c421127` - streamed story generation baseline.
- `f8254a2` - Japanese.
- `92ffd27` - Russian.
- `42f7620` - Indonesian.
- `5013d5b` - Turkish.
- `ca5109f` - Polish.

Each locale commit was pushed to `origin/dev` only after:

```
npm test -- --run src/tests/i18n.test.ts src/tests/page.test.tsx
npm run build
```

### Files To Know

- `src/app/api/stories/start/route.ts` - creates the generating story shell.
- `src/app/api/stories/[id]/stream/route.ts` - streams model text snapshots to the reader and persists the final story.
- `src/app/[locale]/stories/[id]/StoryReader.tsx` - progressive reader UI during generation.
- `src/i18n/locales.ts` - app locale list, Stripe Checkout locale, date locale.
- `src/i18n/clerk.ts` - Clerk localization map.
- `src/lib/storyGenerator.ts` - synchronous and streamed story generation, locale-to-language map.

### QA Still Worth Doing

- In a signed-in browser on dev, create a story and confirm the app navigates immediately to the story page and pages appear progressively.
- Confirm completed stories still allow share, print/PDF, EPUB, illustrated PDF generation, and delete.
- Spot-check the new locale switcher entries and Clerk sign-in UI for `ja`, `ru`, `id`, `tr`, and `pl`.
- Run one Stripe Checkout from a new locale and confirm Checkout receives the expected locale and returns to the localized account page.

---

## Current Handoff - 2026-07-17

Local checkout is synced to `origin/main` at `c1f56bc`. The working tree was clean after sync.

PR #27 merged the accumulated print book, UI consistency, credit enforcement, localization, EPUB compression, and production readiness work into `main`. Vercel production deployed successfully and is aliased to `https://storycot.com` and `https://www.storycot.com`.

### What Shipped

- Print/illustrated book pipeline improvements:
  - Illustrated PDF and EPUB exports.
  - Text-only EPUB export for stories.
  - Kindle-friendly illustrated EPUB compression, with tests covering file-size budget.
  - Incomplete/placeholder art batches now fail cleanly instead of shipping broken output.
  - Book status supports useful failure and retry/repair states.
- Inngest pipeline:
  - Inngest remains opt-in via `BOOK_PIPELINE_DRIVER=inngest`.
  - Preview and production Vercel envs have Inngest keys configured.
  - User confirmed both Inngest apps are now synced.
- Credit/pricing enforcement:
  - Plain story cost is `1` credit.
  - Illustrated book cost is `8` credits.
  - Illustrated generation reserves/captures/refunds credits server-side so failed output does not permanently burn paid value.
- Stripe:
  - Checkout success/cancel URLs derive from the current request origin and locale.
  - Stripe Checkout locale is localized from the active app locale where supported.
  - Dev checkout should stay on `dev.storycot.com`; prod should stay on `storycot.com`.
- UI consistency:
  - Added reusable button/form styling primitives.
  - Profile and new-story forms were brought onto shared styling.
  - Story and dashboard cards now share `StoryCard`.
  - Story/book library filters use shared collection filter components.
  - Share/read/delete actions are visually aligned.
  - Friendly app error/not-found pages replaced raw framework error surfaces.
- Localization:
  - Locale metadata is centralized.
  - Clerk localization is centralized.
  - Added German, Italian, Portuguese, and Dutch.
  - Middleware now derives public locale routes from centralized locale config.
- Cleanup:
  - Legacy broken book-project records were removed via a temporary protected admin route.
  - The temporary cleanup route was deleted before merge.

### Validation Before Production Merge

Run locally before merging PR #27:

```
npm run typecheck
npm test
npm run build
```

All passed. Vercel production deployment for `c1f56bc` reached `Ready`.

### Important Files Added/Changed

- `src/lib/credits.ts` - credit reservation/capture/refund helpers.
- `src/lib/pricing.ts` - central credit costs.
- `src/app/api/books/[id]/build/route.ts` - illustrated build charging.
- `src/lib/print-books/jobs.ts` - refund-safe book job behavior.
- `src/lib/print-books/epub.ts` - EPUB image compression.
- `src/components/ui/Button.tsx`
- `src/components/ui/buttonStyles.ts`
- `src/components/ui/formStyles.ts`
- `src/components/StoryCard.tsx`
- `src/components/BooksLibrary.tsx`
- `src/components/library/CollectionFilters.tsx`
- `src/components/profiles/ProfileFormControls.tsx`
- `src/components/ErrorState.tsx`
- `src/app/[locale]/error.tsx`
- `src/app/global-error.tsx`
- `src/i18n/locales.ts`
- `src/i18n/clerk.ts`
- `src/middleware.ts`

### Runtime QA Still Worth Doing

- Generate one illustrated book on `dev.storycot.com` and confirm the event lands in the preview/staging Inngest app.
- Generate one illustrated book on `storycot.com` and confirm the event lands in the production Inngest app.
- Confirm successful illustrated output charges `8` credits and failed output refunds or avoids capture.
- Download finished illustrated EPUB/PDF on phone/Kindle and confirm file size, cover/title, and open/share behavior.
- Run one real Stripe success and cancel flow on dev and prod, confirming neither environment bounces to the other.
- If Inngest sync/invocation fails:
  - No event appears: check `INNGEST_EVENT_KEY` for that Vercel environment.
  - Event appears but endpoint fails: check `INNGEST_SIGNING_KEY` and endpoint sync URL.
  - Preview endpoint behind Vercel protection should include the automation bypass query param when synced manually.

### Current Operational Notes

- Production branch is protected; merge to `main` requires a PR.
- `main` auto-deploys production through Vercel.
- `feat/ui-consistency-pass` remains on origin but has been merged.
- OpenAI billing needs topping up before heavy real illustrated QA.
- Hardcover/print fulfillment cost modeling is intentionally not included in credit pricing yet.

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
