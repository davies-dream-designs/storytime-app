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
3. [Local development](#local-development)
4. [Environment variables](#environment-variables)
5. [Branch & environment strategy](#branch--environment-strategy)
6. [Clerk authentication](#clerk-authentication)
7. [Stripe billing](#stripe-billing)
8. [Vercel deployment](#vercel-deployment)
9. [Key features](#key-features)
10. [Future roadmap](#future-roadmap)
11. [Outstanding setup tasks](#outstanding-setup-tasks)
12. [Commands](#commands)

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
| Fonts | Fredoka (display) · Nunito (body) |

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # Public homepage
│   ├── dashboard/                # Authenticated home
│   ├── profiles/                 # Child profiles (CRUD)
│   ├── stories/                  # Story library + reader + print
│   ├── account/                  # Credits + share referral
│   ├── s/[token]/                # Public shared story viewer
│   └── api/
│       ├── profiles/             # Profile CRUD
│       ├── stories/              # Story CRUD + generate + suggest
│       ├── stripe/checkout       # Create Stripe Checkout session
│       ├── stripe/webhook        # Handle checkout.session.completed
│       └── referral/redeem       # Redeem referral cookie → credits
├── components/
│   ├── Nav.tsx                   # Sticky nav with mobile hamburger
│   ├── StoryLibrary.tsx          # Client-side search + filter
│   ├── DashboardGreeting.tsx     # Time-based greeting (client)
│   ├── ShareSection.tsx          # Referral link + copy
│   ├── ReferralRedeemer.tsx      # Fires on dashboard load
│   └── RefCapture.tsx            # Captures ?ref= cookie on homepage
├── lib/
│   ├── db.ts                     # Vercel KV abstraction
│   └── storyGenerator.ts         # Claude AI prompt builder
├── types/
│   └── index.ts                  # ChildProfile, Story, helpers
└── middleware.ts                 # Clerk auth — public vs protected routes
```

### Data storage (Vercel KV / Redis)

All data is stored in Vercel KV with key-prefixed patterns:

| Data | Key pattern |
|---|---|
| Child profile | `profile:{userId}:{profileId}` |
| Story | `story:{userId}:{storyId}` |
| Story suggestions cache | `suggestions:{profileId}` (24hr TTL) |
| Characters | `character:{userId}:{characterId}` |

User metadata (credits, referredBy, isAdmin) is stored in **Clerk private metadata** — not KV.

### Credits system

- New users start with 3 free credits (set in Clerk private metadata)
- Each story generation costs 1 credit
- Credits are topped up via Stripe Checkout (one-time packs)
- Admin users (`privateMetadata.isAdmin = true`) have unlimited credits
- Referral system: referring user earns +1 credit when referred user signs up

---

## Local development

### Prerequisites

- Node.js 20.9.0+
- A Clerk account and app (development instance)
- A Vercel account with a KV store
- An Anthropic API key
- A Stripe account (test mode)

### Setup

```bash
git clone https://github.com/davies-dream-designs/storytime-app
cd storytime-app
npm install
cp .env.example .env.local
# Fill in .env.local (see Environment variables section)
npm run dev
```

App runs at `http://localhost:3000`.

> **Never commit `.env.local`** — it's in `.gitignore`. Only `.env.example` (with placeholder
> values, no real secrets) is tracked.

---

## Environment variables

Copy `.env.example` → `.env.local` and fill in:

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
STRIPE_SECRET_KEY=sk_test_...        # Use sk_test_ for dev, sk_live_ for prod
STRIPE_WEBHOOK_SECRET=whsec_...      # From Developers → Webhooks → your endpoint

# App URL — used for Stripe redirect URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000   # Change to https://storycot.com in prod
```

### How Vercel env vars are split by environment

| Variable | Preview (dev.storycot.com) | Production (storycot.com) |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_...` | `pk_live_...` |
| `CLERK_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (test) | `whsec_...` (live) |
| `NEXT_PUBLIC_APP_URL` | `https://dev.storycot.com` | `https://storycot.com` |
| `ANTHROPIC_API_KEY` | same key | same key |
| `KV_*` | same KV store | same KV store |

---

## Branch & environment strategy

| Branch | Deploys to | Clerk | Stripe | Purpose |
|---|---|---|---|---|
| `feat/stripe-billing` | `dev.storycot.com` | dev instance (`pk_test_`) | test keys | Active development |
| `main` | `storycot.com` | production instance (`pk_live_`) | live keys | Production |

**Workflow:** build + test on `feat/stripe-billing` → when happy → merge to `main` → auto-deploys
to `storycot.com`.

---

## Clerk authentication

### Two instances

Clerk uses **instances** to separate dev and production environments. Each has different API
keys and different behaviour (dev shows a "Development mode" banner; production does not).

| Instance | Publishable key prefix | Used on |
|---|---|---|
| Development | `pk_test_` | `dev.storycot.com` + local |
| Production | `pk_live_` | `storycot.com` |

### Making a user admin

Admin users have unlimited credits and bypass all gates. Set via Clerk Dashboard:

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

1. User shares link: `https://storycot.com?ref={userId}`
2. Visitor lands → `RefCapture` writes a 30-day cookie
3. Visitor signs up → first dashboard load → `ReferralRedeemer` fires
4. `POST /api/referral/redeem` → validates ref, grants +1 credit to referrer
5. Sets `privateMetadata.referredBy` on new user (one-time, prevents gaming)

---

## Stripe billing

### Credit packs

| Pack | Credits | Price (AUD) |
|---|---|---|
| Starter | 10 | $4.99 |
| Family | 30 | $11.99 |
| Bedtime Pro | 100 | $29.99 |

### Flow

1. User clicks pack → `POST /api/stripe/checkout` → creates Stripe Checkout session
2. User pays on Stripe-hosted checkout
3. Stripe fires `checkout.session.completed` webhook → `POST /api/stripe/webhook`
4. Webhook adds purchased credits to user's Clerk `privateMetadata.credits`

### Webhooks

You need **two** webhook endpoints — one for test mode, one for live:

| Mode | Endpoint URL | Event |
|---|---|---|
| Test | `https://dev.storycot.com/api/stripe/webhook` | `checkout.session.completed` |
| Live | `https://storycot.com/api/stripe/webhook` | `checkout.session.completed` |

Register both in Stripe Dashboard → Developers → Webhooks.  
Copy the `whsec_...` signing secret for each and set in Vercel for the respective environment.

### Stripe branding (already configured)

- Logo: Storycot icon (uploaded via API)
- Primary colour: `#252748`
- Accent colour: `#F4C85C`
- Statement descriptor: `STORYCOT`

---

## Vercel deployment

The project deploys automatically via GitHub integration:

- Push to `feat/stripe-billing` → preview deploy → `dev.storycot.com`
- Push/merge to `main` → production deploy → `storycot.com`

### DNS

`storycot.com` uses **Vercel nameservers** (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`).
Vercel auto-manages all DNS records including the `dev.storycot.com` subdomain.

Google Workspace MX records are also managed in Vercel DNS for `storycot.com` email.

---

## Key features

- **Child profiles** — name, date of birth (auto-computes age in months/years), favourites,
  lessons, custom characters
- **Story generation** — Claude AI, ~750 words, 14 pages, themed around a moral/lesson
- **Story library** — searchable by title/theme, filterable by child
- **PDF/print** — full print layout with branded cover and back cover
- **Credit system** — Stripe one-time packs, admin bypass, referral bonus
- **Referral** — share link → cookie → auto-redeem on first login
- **Mobile nav** — hamburger menu on < 640px, full nav on desktop
- **Themed story cards** — each theme has unique emoji + accent colour

---

## Future roadmap

### Printed hardcover books (Lulu integration)
Physical hardcovered books via [Lulu](https://lulu.com). Requirements before implementing:
- **32 pages** (Lulu minimum for hardcover)
- **AI-generated illustrations** — one per page needed first
- API integration for order placement + fulfilment
- The "Print / PDF" button stays; a separate "Order hardcover" button will be added

### Clerk Billing (tiering)
If a subscription/tier model is needed in future (e.g. free = 2 profiles, paid = unlimited),
use the `clerk-billing` skill which integrates directly with Clerk's billing feature.

### Email notifications
Resend is available as an MCP tool. Planned uses:
- Birthday credit notification (helper `isBirthday()` is already built in `src/types/index.ts`)
- Story generated confirmation
- Low credits warning

### Google Workspace
`hello@storycot.com` is set up as a domain alias under the DDD Google Workspace account.
MX records are live. Verification was pending — retry in Google Workspace domain setup if
email isn't working.

---

## Outstanding setup tasks

### 🔴 Must do before launch (storycot.com)

- [ ] **Stripe live webhook** — register `https://storycot.com/api/stripe/webhook` in Stripe
  Dashboard (live mode) → copy `whsec_...` → set `STRIPE_WEBHOOK_SECRET` for Production in Vercel
- [ ] **Stripe live secret key** — add full `sk_live_...` to Vercel Production env vars
  (currently only the restricted `rk_live_` key exists, which can't process payments)

### 🟡 Nice to do before launch

- [ ] **Clerk branding** — add Storycot logo + brand colour in Clerk Dashboard for both
  dev and production instances: Application → Settings (logo) + Customization → Emails
- [ ] **Google Workspace verification** — retry domain verification for `storycot.com` in
  Google Workspace if `hello@storycot.com` isn't receiving mail yet
- [ ] **Merge feat/stripe-billing → main** — push everything live

### 🟢 Post-launch

- [ ] **Lulu integration** — hardcover printed books (needs illustrations first)
- [ ] **AI illustrations** — one image per page before Lulu becomes viable
- [ ] **Birthday credits** — grant +1 credit + send email on child's birthday
- [ ] **Tiering / subscriptions** — if profile/story volume requires gating
- [ ] **Google Business Profile** — set up GBP for storycot.com

---

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
```

---

## Security notes

- **Never commit `.env.local`** — it's in `.gitignore`
- Only `.env.example` is tracked — it contains placeholder values only
- All Stripe and Clerk keys live in Vercel environment variables, scoped per environment
- Clerk `privateMetadata` is server-only — never exposed to the client
- Stripe webhook signature is verified on every request (`stripe.webhooks.constructEvent`)
- Profile ownership is checked on every read/write (`profile.userId !== userId → 404`)
- Referral codes are validated against Clerk user format (`/^user_[A-Za-z0-9]+$/`)
- Self-referral is blocked in `/api/referral/redeem`
