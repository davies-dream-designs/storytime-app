# Storycot

**Personalised AI bedtime stories for the little ones you love.**

Storycot generates bespoke, 700–900 word bedtime stories starring your child — their favourite
toys, animals, and adventures woven into every page. Stories are saved to a library and can be
exported as a print-ready PDF.

> **Tagline:** Helping little dreamers drift off to their happiest adventures.

---

## Table of contents

1. [Tech stack](#tech-stack)
2. [Architecture](#architecture)
3. [Infrastructure overview](#infrastructure-overview)
4. [Local development](#local-development)
5. [Environment variables](#environment-variables)
6. [Branch & environment strategy](#branch--environment-strategy)
7. [Clerk authentication](#clerk-authentication)
8. [Stripe billing](#stripe-billing)
9. [Vercel deployment](#vercel-deployment)
10. [Testing](#testing)
11. [Key features](#key-features)
12. [Future roadmap](#future-roadmap)
13. [Outstanding setup tasks](#outstanding-setup-tasks)
14. [Commands](#commands)
15. [Security](#security)

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Auth | Clerk |
| Database | Vercel KV (Redis) |
| AI | Anthropic Claude (story generation) |
| Payments | Stripe Checkout (one-time credit packs) |
| Hosting | Vercel |
| Email | Google Workspace (`hello@storycot.com`) |
| Fonts | Fredoka (display) · Nunito (body) |

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # Public homepage
│   ├── dashboard/                # Authenticated home (greeting + quick links)
│   ├── profiles/                 # Child profiles (CRUD)
│   ├── stories/                  # Story library + reader + print
│   ├── account/                  # Credits balance + Stripe packs + referral
│   ├── s/[token]/                # Public shared story viewer
│   └── api/
│       ├── profiles/             # Profile CRUD
│       ├── stories/              # Story CRUD + generate + suggest
│       ├── stripe/checkout/      # Create Stripe Checkout session
│       ├── stripe/webhook/       # Handle checkout.session.completed
│       └── referral/redeem/      # Redeem referral cookie → credits
├── components/
│   ├── Nav.tsx                   # Sticky nav with mobile hamburger
│   ├── StoryLibrary.tsx          # Client-side search + theme-coloured cards
│   ├── DashboardGreeting.tsx     # Time-based greeting (client)
│   ├── ShareSection.tsx          # Referral link + copy to clipboard
│   ├── ReferralRedeemer.tsx      # Fires on dashboard load to redeem ref cookie
│   └── RefCapture.tsx            # Captures ?ref= cookie on homepage
├── lib/
│   ├── db.ts                     # Vercel KV abstraction layer
│   └── storyGenerator.ts         # Claude AI prompt builder + parser
├── types/
│   └── index.ts                  # ChildProfile, Story types + formatAge()
└── middleware.ts                 # Clerk auth — public vs protected routes
```

---

## Infrastructure overview

This section explains every external service the app depends on, what it does, and how it
connects to everything else.

```
                    ┌─────────────────────────────────────┐
                    │           GitHub                    │
                    │  davies-dream-designs/storytime-app │
                    │  Branch protection on main          │
                    │  Dependabot security alerts         │
                    └──────────┬──────────────────────────┘
                               │ auto-deploy on push
              ┌────────────────▼───────────────────────┐
              │              Vercel                     │
              │  Hosts Next.js (serverless + edge)      │
              │  Two domains:                           │
              │   dev.storycot.com → feat/* branches    │
              │   storycot.com     → main branch        │
              │  Deployment protection on preview URLs  │
              │  Environment variable isolation         │
              └──┬────────┬────────┬───────────────────┘
                 │        │        │
        ┌────────▼──┐  ┌──▼───┐  ┌▼──────────────────────┐
        │ Vercel KV │  │Clerk │  │    Anthropic Claude    │
        │ (Redis)   │  │(Auth)│  │  Story generation AI   │
        │ Profiles  │  │      │  │  Model: claude-3-5-    │
        │ Stories   │  │ Dev  │  │  haiku / claude-3-7-   │
        │ Characters│  │ Prod │  │  sonnet                │
        └───────────┘  └──┬───┘  └───────────────────────┘
                          │
              ┌───────────▼─────────────────────┐
              │           Stripe                │
              │  Checkout sessions (AUD)        │
              │  Webhook → credits via Clerk    │
              │  Test mode ↔ Live mode split    │
              └─────────────────────────────────┘
                          │
              ┌───────────▼─────────────────────┐
              │      Google Workspace           │
              │  hello@storycot.com email       │
              │  MX records via Vercel DNS      │
              └─────────────────────────────────┘
```

### Vercel

- **Role**: Hosts the Next.js app as serverless functions + Edge middleware
- **DNS**: Nameservers delegated to Vercel (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`)
- **Domains**: `storycot.com` (production), `dev.storycot.com` (preview)
- **Deployment protection**: Preview deployments require Vercel login or a bypass token
  (`_vercel_share=...`). Bypass tokens expire after ~23 hours.
- **Environment variable scoping**: Vercel supports `preview` and `production` scopes,
  allowing different Clerk/Stripe keys per environment (see [Environment variables](#environment-variables))
- **KV store**: Vercel KV (Upstash Redis) is linked to the project. Connection strings are
  auto-injected as `KV_*` env vars. Both environments share the same KV instance.

### Vercel KV (Redis)

- **Role**: Primary database for all app data
- **Technology**: Upstash Redis (Vercel KV), accessed via `@vercel/kv`
- **Key patterns**:
  | Data | Redis key |
  |---|---|
  | Child profile | `profile:{userId}:{profileId}` |
  | Story | `story:{userId}:{storyId}` |
  | Story suggestions | `suggestions:{profileId}` (24hr TTL) |
  | Character | `character:{userId}:{characterId}` |
- **Data size**: Profiles and stories are JSON objects stored as Redis strings
- **No user metadata here** — credits, admin flag, referral are in Clerk `privateMetadata`

### Clerk

- **Role**: Authentication + user metadata (credits, admin, referral)
- **Two instances** (separate API keys, separate user databases):
  | Instance | Purpose | Key prefix |
  |---|---|---|
  | Development | `dev.storycot.com` + local dev | `pk_test_` / `sk_test_` |
  | Production | `storycot.com` | `pk_live_` / `sk_live_` |
- **User metadata stored in Clerk** (never in KV):
  - `privateMetadata.credits` — story credit balance (number)
  - `privateMetadata.isAdmin` — bypasses credit check (boolean)
  - `privateMetadata.referredBy` — userId of referrer (set once on sign-up)
- **Middleware**: `src/middleware.ts` protects all routes except `/`, `/sign-in`, `/sign-up`,
  `/s/*` (shared stories), and `/api/stripe/webhook`
- **Allowed origins**: Set on both instances to include `storycot.com`, `dev.storycot.com`,
  and `www.storycot.com`

### Anthropic Claude

- **Role**: AI story generation
- **Called from**: `src/app/api/stories/generate/route.ts`
- **Flow**: Profile data + theme → prompt → Claude → parsed 14-page story → stored in KV
- **Model**: Configured in `storyGenerator.ts` (use latest Claude 3.x for quality)
- **Cost**: Per-token, billed to the Anthropic account. Not per-user — stories cost ~1–2k
  output tokens each.

### Stripe

- **Role**: Payment processing for credit packs
- **Mode split**: Test mode keys on `dev.storycot.com`, live mode keys on `storycot.com`
- **Flow**:
  1. User clicks a credit pack → `POST /api/stripe/checkout` creates a Checkout Session
  2. User is redirected to Stripe-hosted checkout page
  3. User pays (AUD)
  4. Stripe fires `checkout.session.completed` webhook to `/api/stripe/webhook`
  5. Webhook verifies signature, reads `metadata.userId` and `metadata.credits`, updates Clerk
- **Branding**: Configured via Stripe API — logo, `#252748` primary, `#F4C85C` accent,
  statement descriptor `STORYCOT`
- **Keys**:
  - `rk_live_...` — restricted live key (branding/metadata only, not for payments)
  - `sk_live_...` — full live secret key (required for Checkout + webhook verification)
  - `sk_test_...` — test secret key (for `dev.storycot.com`)

### Google Workspace

- **Role**: `hello@storycot.com` email address
- **Setup**: Domain alias under the DDD Google Workspace account
- **DNS**: MX records managed in Vercel DNS for `storycot.com`
- **Status**: Verified and active. Configure "Send as" in Gmail to send from this address.

### GitHub

- **Role**: Source control + CI trigger for Vercel deploys
- **Repo**: `davies-dream-designs/storytime-app`
- **Branch protection**: `main` requires a pull request (direct push blocked)
- **Dependabot**: 1 moderate vulnerability alert outstanding — check Security tab

---

## Local development

### Prerequisites

- Node.js 20.9.0+
- A Clerk account (development instance)
- A Vercel project with KV store linked
- An Anthropic API key
- A Stripe account (test mode)

### Setup

```bash
git clone https://github.com/davies-dream-designs/storytime-app
cd storytime-app
npm install
cp .env.example .env.local
# Fill in .env.local — see Environment variables section
npm run dev
```

App runs at `http://localhost:3000`.

> **Never commit `.env.local`** — it's in `.gitignore`. Only `.env.example` (with placeholder
> values, no real secrets) is tracked in git.

---

## Environment variables

Copy `.env.example` → `.env.local` and fill in real values:

```bash
# Anthropic — https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-...

# Clerk — https://dashboard.clerk.com → your app → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Vercel KV — auto-populated when you link a KV store in Vercel dashboard
KV_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=

# Stripe — https://dashboard.stripe.com → Developers → API Keys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# App URL — used for Stripe redirect URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### How Vercel splits env vars by environment

In Vercel, each env var can target `preview` and/or `production`. We use this to run different
Clerk and Stripe keys per environment:

| Variable | Preview (`dev.storycot.com`) | Production (`storycot.com`) |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` (dev instance) | `pk_live_...` (prod instance) |
| `CLERK_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (test endpoint) | `whsec_...` (live endpoint) |
| `NEXT_PUBLIC_APP_URL` | `https://dev.storycot.com` | `https://storycot.com` |
| `ANTHROPIC_API_KEY` | same key both envs | same key both envs |
| `KV_*` | same KV store both envs | same KV store both envs |

> **Note**: Vercel does not allow sensitive env vars to target the `development` environment
> (only `preview` and `production`). Use `.env.local` for local development.

---

## Branch & environment strategy

| Branch | Auto-deploys to | Clerk | Stripe | Purpose |
|---|---|---|---|---|
| `feat/stripe-billing` | `dev.storycot.com` | dev instance | test keys | Active development |
| `main` | `storycot.com` | prod instance | live keys | Production |

**Workflow:** build + test on feature branch → PR to main → merge → auto-deploys to
`storycot.com`.

`main` is branch-protected — direct pushes are blocked; all changes go via pull request.

---

## Clerk authentication

### Two instances

Clerk uses separate **instances** to isolate dev and production. Dev instances show a
"Development mode" banner; production instances do not.

### Making a user admin

Admin users have unlimited credits and bypass all gates:

1. Clerk Dashboard → Users → find the user
2. **Metadata** tab → **Private metadata** → add:
   ```json
   { "isAdmin": true, "credits": 999 }
   ```

### Protected vs public routes

Configured in `src/middleware.ts`. Public routes:

- `/` — homepage
- `/sign-in`, `/sign-up`
- `/s/*` — shared story viewer (public link)
- `/api/stripe/webhook` — Stripe hits this without auth

Everything else requires authentication.

### Referral system

1. User shares: `https://storycot.com?ref={userId}`
2. Visitor lands → `RefCapture` writes a 30-day cookie
3. Visitor signs up → `ReferralRedeemer` fires on first dashboard load
4. `POST /api/referral/redeem` → validates ref, grants +1 credit to referrer
5. Sets `privateMetadata.referredBy` (one-time, prevents repeat claiming)

---

## Stripe billing

### Credit packs

| Pack | Credits | Price (AUD) |
|---|---|---|
| Starter | 10 | $4.99 |
| Family | 30 | $11.99 |
| Bedtime Pro | 100 | $29.99 |

### Webhooks

Two webhook endpoints must be registered in Stripe Dashboard → Developers → Webhooks:

| Mode | Endpoint URL | Event |
|---|---|---|
| Test | `https://dev.storycot.com/api/stripe/webhook` | `checkout.session.completed` |
| Live | `https://storycot.com/api/stripe/webhook` | `checkout.session.completed` |

Copy the `whsec_...` signing secret for each and set in Vercel for the respective environment.

---

## Vercel deployment

Vercel auto-deploys on push via GitHub integration:

- Push to any branch → preview deploy
- Push/merge to `main` → production deploy → `storycot.com`
- `dev.storycot.com` custom domain is assigned to the `feat/stripe-billing` branch in Vercel
  project settings (Domains → assign to branch)

---

## Testing

### Build verification

```bash
npm run build    # Catches TypeScript errors and route build failures
npm run lint     # ESLint
```

### Unit tests

```bash
npm test         # Vitest — runs src/__tests__/**
```

### End-to-end tests (Playwright)

E2E tests run against the live `dev.storycot.com` deployment. They require:

1. A Clerk dev test user
2. A Vercel deployment protection bypass token
3. The Clerk dev secret key

#### Environment variables for E2E tests

Add these to your `.env.local` (never commit real values):

```bash
# E2E testing
CLERK_PUBLISHABLE_KEY=pk_test_...      # Clerk dev instance publishable key
CLERK_SECRET_KEY=sk_test_...           # Clerk dev instance secret key (also used by app)
PLAYWRIGHT_BASE_URL=https://dev.storycot.com
VERCEL_BYPASS_URL=https://dev.storycot.com/?_vercel_share=<token>
E2E_TEST_USER_ID=user_<clerk-user-id>  # The test user's Clerk ID
```

#### Test user setup

Create a permanent test user in the Clerk dev instance:

```bash
curl -X POST https://api.clerk.com/v1/users \
  -H "Authorization: Bearer $CLERK_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email_address": ["playwright@storycot-test.com"],
    "password": "PlaywrightTest123!",
    "first_name": "Playwright",
    "last_name": "Test",
    "private_metadata": { "credits": 10 }
  }'
```

Save the returned user ID as `E2E_TEST_USER_ID` in `.env.local`.

#### Vercel bypass token

Preview deployments at `dev.storycot.com` have Vercel deployment protection enabled.
Playwright bypasses this by visiting a short-lived shareable URL first, which sets a bypass
cookie. The token expires after ~23 hours.

Regenerate when expired:
- Use the Vercel MCP tool `get_access_to_vercel_url` with `url: https://dev.storycot.com`
- Copy the returned `shareableUrl` into `VERCEL_BYPASS_URL` in `.env.local`

#### How sign-in works in tests

The tests use **Clerk sign-in tokens** (not the password form). This is more reliable than
automating the Clerk UI, which has bot detection.

```
Test → POST /v1/sign_in_tokens → gets JWT
     → navigate to dev.storycot.com/sign-in?__clerk_ticket=JWT
     → Clerk auto-redeems token, signs in user, redirects to /
     → Test navigates to /dashboard
```

Tokens expire after 120 seconds, so a fresh one is fetched for each test.

#### Running E2E tests

```bash
# Run all PR checklist tests
PLAYWRIGHT_BASE_URL=https://dev.storycot.com \
  CLERK_SECRET_KEY=sk_test_... \
  CLERK_PUBLISHABLE_KEY=pk_test_... \
  npx playwright test e2e/pr-checklist.spec.ts --project=chromium

# Or with .env.local populated (uses dotenv)
npx playwright test e2e/pr-checklist.spec.ts --project=chromium
```

#### What the PR checklist tests cover

| Test | What it checks |
|---|---|
| Mobile nav hamburger | Opens/closes drawer on 390px viewport |
| Nav SVG logo | `icon-light.svg` in header, not emoji |
| Story library | Search + filter UI, or empty state |
| Profile creation | Day/Month/Year DOB dropdowns, months display for under-1 |
| Story generation | Credit decrements after generate |
| Print page | Storycot logo + branding on cover and back |
| Stripe checkout | Credit pack button → Stripe hosted page → success redirect |

#### Playwright configuration

`playwright.config.ts` skips the local webserver when `PLAYWRIGHT_BASE_URL` is set to a remote
URL. For local testing, it builds and runs the standalone Next.js server.

---

## Key features

- **Child profiles** — name, date of birth (auto-computes age in months/years), favourites,
  lessons, custom characters
- **Story generation** — Claude AI, ~750 words, 14 pages, themed around a moral/lesson
- **Story library** — searchable by title/theme, filterable by child
- **Print / PDF** — full print layout with branded cover and back cover
- **Credit system** — Stripe one-time packs, admin bypass, referral bonus
- **Referral** — share link → cookie → auto-redeem on first login
- **Mobile nav** — hamburger menu on < 640px, full nav on desktop
- **Themed story cards** — each of 13 themes has unique emoji + accent colour

---

## Future roadmap

### Printed hardcover books (Lulu integration)
Physical hardcovered books via [Lulu](https://lulu.com). Requirements before implementing:
- **32 pages** (Lulu minimum for hardcover)
- **AI-generated illustrations** — one per page needed first
- API integration for order placement + fulfilment

### AI illustrations
AI-generated art for each story page (e.g. via Replicate/DALL-E). This unlocks Lulu printing
and makes the print PDF significantly more premium.

### Clerk Billing (tiering)
Subscription tiers if usage requires it. The `clerk-billing` skill handles this end-to-end.

### Email notifications (Resend)
- Birthday credit notification (`isBirthday()` helper already in `src/types/index.ts`)
- Story generated confirmation
- Low credits warning

### Google Business Profile
Set up GBP for `storycot.com` to appear in local search.

---

## Outstanding setup tasks

### 🔴 Must do before launch

- [ ] **Stripe live webhook** — register `https://storycot.com/api/stripe/webhook` in Stripe
  Dashboard (live mode) → copy `whsec_...` → set `STRIPE_WEBHOOK_SECRET` for Production in Vercel
- [ ] **Stripe live `sk_live_` key** — add full `sk_live_...` to Vercel Production env vars
  (the `rk_live_...` restricted key only works for branding, not Checkout)

### 🟡 Nice to do before launch

- [ ] **Clerk branding** — logo + brand colour in Clerk Dashboard for both instances:
  Application → Settings (logo) + Customization → Emails
- [ ] **Merge `feat/stripe-billing` → `main`** — go live

### 🟢 Post-launch

- [ ] **Lulu integration** — needs AI illustrations first
- [ ] **AI illustrations** — one image per story page
- [ ] **Birthday credits** — +1 credit + email on child's birthday
- [ ] **Google Business Profile** — storycot.com local search presence
- [ ] **Fix Dependabot alert** — 1 moderate vulnerability on `main` branch

---

## Commands

```bash
npm run dev          # Start dev server → http://localhost:3000
npm run build        # Production build (also runs type check)
npm run lint         # ESLint
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E (needs env vars — see Testing section)
```

---

## Security

### Secrets management

All secrets are stored in **Vercel environment variables** (scoped per environment) and in
**`.env.local`** for local development. No secrets are committed to git.

| Secret | Where it lives |
|---|---|
| `ANTHROPIC_API_KEY` | Vercel env vars + `.env.local` |
| `CLERK_SECRET_KEY` | Vercel env vars (scoped) + `.env.local` |
| `STRIPE_SECRET_KEY` | Vercel env vars (scoped) + `.env.local` |
| `STRIPE_WEBHOOK_SECRET` | Vercel env vars (scoped) + `.env.local` |
| `KV_REST_API_TOKEN` | Vercel env vars (auto-injected) + `.env.local` |
| Vercel bypass tokens | `.env.local` only (short-lived, ~23h) |

Only `.env.example` — containing **placeholder values only** — is tracked in git.

### Application security

- **Clerk `privateMetadata`** is server-only — never exposed to the client or in API responses
- **Stripe webhook signature** is verified on every request (`stripe.webhooks.constructEvent`)
- **Profile ownership** is checked on every read/write (`profile.userId !== userId → 404`)
- **Referral codes** are validated against Clerk user ID format (`/^user_[A-Za-z0-9]+$/`)
- **Self-referral** is blocked in `/api/referral/redeem`
- **Credit gate** checked server-side before every story generation

### Git hygiene

```bash
# Verify no secrets in tracked files
git ls-files | grep -E "\.env"  # Should only return .env.example

# Verify no secrets in git history
git log --all -S "sk_live_|sk_test_|pk_live_|whsec_" --oneline
```
