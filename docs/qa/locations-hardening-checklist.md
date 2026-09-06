# QA checklist — locations hardening + credit/webhook fixes (PR #187)

What automated coverage already exists, what you need to test by hand, and the
exact deploy order. Ticked items are covered by the test suites; unticked need a
human (they touch real money, real image generation, or a live DB).

## Automated (already green — no action needed)

- [x] `npm run typecheck` · `npm run lint` · `npm test` (**503 unit/integration tests**) · `npm run build`
- [x] Wrong-room prevention, fixture binding, review gating (unit)
- [x] Book-override preservation, source-page provenance (unit)
- [x] Atomic job publication (CAS), retryable vs terminal job failures (unit)
- [x] SSRF allowlist for media fetches (unit)
- [x] Share-link revocation on delist, profile-deletion cascade, field allowlists (unit)
- [x] Stripe stranded-fulfillment retry, Lulu owner/public order resolution, owner shipped-email recipient (unit)
- [x] Webhook lease (pending/done/steal), credit ledger idempotency + no-lost-updates (unit)
- [x] Branch preview boots, auth works, stories library renders (Playwright, read-only) — `e2e/locations-readonly.spec.ts`

## ⚠️ Deploy order (do this FIRST)

The preview currently 500s on `/en/locations` because the DB is missing the new
columns. **Apply migrations before (or together with) the deploy:**

1. `0023_location_fixture_views` — `location_fixtures.views`
2. `0024_webhook_event_lease` — `processed_webhook_events.status` + `lease_expires_at`
3. `0025_credit_ledger` — `user_credits` + `credit_ledger` tables

Run: `npm run db:migrate` against the target DB. All three are idempotent
(`IF NOT EXISTS`). Keep `CREDIT_LEDGER_ENABLED` **unset/false** for now.

## Manual QA — Locations (needs migration 0023)

1. [ ] Locations page loads (no error boundary).
2. [ ] Add a place, upload 1-3 photos, Save -> status shows "Drawing...".
3. [ ] **L1**: leave the page while it draws, come back -> the finished
   illustration appears without a manual reload.
4. [ ] **Multi-perspective**: on a place that already has a primary image, use
   "Add another angle", label it (e.g. "Cot corner"), upload -> it appears under
   "Extra angles"; the primary preview is unchanged.
5. [ ] Remove an extra angle -> it disappears; primary stays.
6. [ ] **L6 (privacy)**: the uploaded room photo URL must NOT be publicly
   readable (open the blob URL in an incognito window -> should be denied).
   Confirm temp photos are gone after the drawing completes.
7. [ ] Build a book that uses a saved place:
   - [ ] **L2**: a saved *Lounge* is never applied to a *Kitchen*; unmatched
     selections trigger the review step.
   - [ ] **L3**: correct a location's notes/image in the book, rebuild -> your
     correction is preserved (not overwritten by the library default).
   - [ ] **L4**: a story with repeated/near-identical page text maps each spread
     to the right place.

## Manual QA — Print / Lulu (needs a real Lulu sandbox order)

8. [ ] Owner print order ships -> owner receives the shipped email at their
   account email, with tracking.
9. [ ] Public-buyer print order ships -> the *buyer* (not the owner) gets the
   shipped email + tracking; the owner's order is untouched.
10. [ ] Force an enqueue failure (or observe a real one) -> the Stripe event is
    retried on redelivery and the order still gets fulfilled exactly once.

## Credit ledger rollout (staged — do NOT enable in prod yet)

Do this on **staging** first:

11. [ ] Apply `0025`, set `CREDIT_LEDGER_ENABLED=true` on staging only.
12. [ ] Read balance for a known user -> matches their current Clerk credits
    (lazy seed worked).
13. [ ] Generate a story -> balance drops by 1 in DB **and** the account page
    still shows the right number (Clerk mirror).
14. [ ] Fire several concurrent story generations for one user -> total debit
    equals the number of stories (no lost updates).
15. [ ] Retry the same generation (same story id) -> balance does NOT drop twice
    (idempotent by `dedupeKey`).
16. [ ] Admin grant twice with the same reason/key -> applied once.
17. [ ] Purchase credits (Stripe test) -> balance increases once even on webhook
    redelivery.
18. [ ] Only after all the above pass on staging: enable the flag in prod.

> Note: with the flag OFF (default), credit behaviour is exactly as it is today —
> the ledger code is dormant, so shipping this PR changes nothing about credits
> until you flip the flag.
