# Architecture

## Overview

The template is a server-rendered Next.js 15 application using the App Router. It is deliberately minimal: one page, one API route, and a CI pipeline.

## Directory layout

```
app-template/
├── src/
│   ├── app/                    Next.js App Router root
│   │   ├── api/health/         Health check route handler
│   │   ├── layout.tsx          Root HTML shell
│   │   ├── page.tsx            Homepage (Server Component)
│   │   └── globals.css         Tailwind CSS entry point
│   └── tests/                  Vitest unit tests + setup
├── e2e/                        Playwright end-to-end tests
├── .github/workflows/          GitHub Actions CI
├── docs/                       Project documentation
├── Dockerfile                  Multi-stage production image
├── docker-compose.yml          Local development container
└── playwright.config.ts        E2E test configuration
```

## Request flow

```
Browser / curl
     │
     ▼
Next.js server
     ├── / ──────────────────► page.tsx (Server Component → HTML)
     └── /api/health ─────────► route.ts (Edge-compatible handler → JSON)
```

## Deployment model

The Dockerfile produces a self-contained Node.js image using Next.js standalone output. The image runs as a non-root user (`nextjs`).

For cloud deployment, replace the Dockerfile's CMD with your platform's preferred entrypoint or use `npm run start` directly (e.g. on Vercel/Railway/Render where the runtime is managed).

## Constraints

- No database: this template contains no data-persistence layer. Add one by introducing a connection pool (e.g. `pg`, `drizzle-orm`) and a `DATABASE_URL` env var.
- No auth: authentication is out of scope. Add a provider (e.g. NextAuth.js) when needed.
