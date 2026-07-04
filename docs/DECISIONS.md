# Decisions

Architecture decisions and the rationale behind them.

---

## ADR-01: Next.js App Router

**Decision:** Use the Next.js 15 App Router instead of the Pages Router.

**Rationale:** App Router is the default and recommended approach for new projects as of Next.js 13+. It enables React Server Components, co-located layouts, and simplified data-fetching patterns.

---

## ADR-02: Vitest over Jest

**Decision:** Use Vitest for unit tests.

**Rationale:** Vitest shares Vite's configuration ecosystem and is significantly faster than Jest in watch mode. It has first-class ESM support and near-identical APIs, making migration trivial if needed.

---

## ADR-03: Tailwind CSS v4

**Decision:** Use Tailwind CSS v4 with the `@tailwindcss/postcss` plugin.

**Rationale:** Tailwind v4 removes the need for a `tailwind.config.ts` file and simplifies setup to a single CSS import (`@import "tailwindcss"`). The postcss plugin handles the transformation automatically.

---

## ADR-04: Multi-stage Dockerfile

**Decision:** Build the production Docker image in three stages: `deps`, `builder`, `runner`.

**Rationale:** The runner stage only contains the compiled output and production runtime, keeping the image small and free of build tooling. The non-root `nextjs` user reduces the attack surface.

---

## ADR-05: GitHub Actions single-job CI

**Decision:** Run lint, typecheck, unit tests, and build as sequential steps in a single job.

**Rationale:** For a minimal template, a single job avoids the overhead of uploading/downloading artifacts between jobs while still enforcing every quality gate. Parallelise into separate jobs if build times become a concern.

---

## ADR-06: No secrets in repository

**Decision:** All environment-specific configuration is read from environment variables at runtime. No secrets are committed.

**Rationale:** Committed secrets are a leading cause of security incidents. The `.env.example` file documents what variables are needed without containing real values.
