# Requirements

## Functional requirements

| ID | Requirement |
|---|---|
| F-01 | The application shall serve a homepage at `/`. |
| F-02 | The application shall expose a health check at `GET /api/health` returning `{ "status": "ok" }` with HTTP 200. |

## Non-functional requirements

| ID | Requirement |
|---|---|
| NF-01 | The application shall build successfully for production with `npm run build`. |
| NF-02 | All TypeScript shall pass strict-mode compilation with zero errors. |
| NF-03 | All ESLint rules from `next/core-web-vitals` shall pass. |
| NF-04 | Unit tests shall achieve coverage of all exported route handlers and primary page components. |
| NF-05 | A Playwright smoke test shall validate the homepage and health endpoint against a production build. |
| NF-06 | The application shall be containerisable via the provided multi-stage Dockerfile without modification. |
| NF-07 | The CI pipeline shall enforce lint, typecheck, unit tests, and production build on every push and pull request. |

## Out of scope (for this template)

- Authentication / authorisation
- Database layer
- User-facing features beyond the homepage
