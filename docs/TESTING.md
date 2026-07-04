# Testing

## Strategy

| Layer | Tool | What is tested |
|---|---|---|
| Unit | Vitest + React Testing Library | Route handlers, React components |
| End-to-end | Playwright | User-visible behaviour against a running build |

## Running tests

```bash
# Unit tests (single run)
npm test

# Unit tests (watch mode)
npm run test:watch

# End-to-end tests (requires build)
npm run test:e2e
```

## Unit tests

Unit tests live in `src/tests/` alongside the source they exercise.

- `page.test.tsx` — renders the homepage and asserts the heading and description are present.
- `health.test.ts` — calls the `GET` handler directly and asserts the JSON body and HTTP status.

The Vitest setup file (`src/tests/setup.ts`) imports `@testing-library/jest-dom` to provide DOM matchers such as `toBeInTheDocument`.

## End-to-end tests

E2E tests live in `e2e/` and use Playwright.

`smoke.spec.ts` covers:
1. Homepage loads and the heading is visible.
2. `GET /api/health` returns HTTP 200 with `{ "status": "ok" }`.

The `playwright.config.ts` `webServer` block automatically builds and starts the production server before running tests.

## CI

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs unit tests and a production build on every push and pull request. E2E tests are intentionally omitted from CI to avoid the overhead of a browser install; add the following step to enable them:

```yaml
- name: Install Playwright browsers
  run: npx playwright install --with-deps chromium

- name: E2E tests
  run: npm run test:e2e
```

## Adding tests

- **New component** → add a `*.test.tsx` file in `src/tests/`.
- **New API route** → add a `*.test.ts` file in `src/tests/` that imports and calls the handler directly.
- **New user journey** → add a `*.spec.ts` file in `e2e/`.
