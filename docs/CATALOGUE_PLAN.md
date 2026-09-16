# Storycot Trade Books — Plan v2

**Status:** Draft for discussion. No code written yet.
**Supersedes:** v1 (which assumed an on-site catalogue and a profile-driven build).

---

## 1. What you asked for

> An automation that checks trends → builds a book with a cast it chooses (a kid, a mum,
> whatever fits) → I review → approve or decline → approved books go into an online store
> for public purchase. **No profile creation. Not inside the Storycot website.**

Three consequences fall out of that, and they are all simplifying:

1. **No storefront to build.** "Not on the Storycot website" means we do not build catalogue
   browse pages, cart, checkout, entitlements, or digital delivery. That was the single biggest
   chunk of v1 — it's gone. We use an external store instead (§4).
2. **No profiles.** Confirmed feasible — see §3. The blocker is smaller than expected.
3. **Review/approve is the product.** The admin queue is the only UI we actually have to build.

The pipeline becomes: **trend research → seed brief → build → review → approve → publish to store.**

---

## 2. The one thing I need to flag first

Research on the external-store options turned up a hard constraint that shapes everything:

> **Amazon KDP cannot print your hardcover.** KDP's premium-colour hardcover spec is
> **75–550 pages**. Your books are 24–72pp. There is no colour hardcover under 75pp.
> Additionally, **Amazon.com.au does not sell KDP hardcovers at all** — there is no AUD row in
> KDP's hardcover printing-cost tables.
> — <https://kdp.amazon.com/en_US/help/topic/GHT976ZKSKUXBB6H>

And the corollary that decides the architecture:

> **Lulu Global Distribution: Amazon rejects ALL hardcovers submitted via Lulu GD.** Ingram
> still accepts them.
> — <https://help.lulu.com/en/support/solutions/articles/64000255462>

So the "just put it on Amazon" instinct doesn't work for your format. Your 8.5" square colour
hardcover, at 24–72pp, is sellable through **Lulu Direct → Shopify**, the **Lulu Bookstore**, and
**IngramSpark** — but not as an Amazon hardcover.

**On AI content — not a blocker.** KDP requires you to *disclose* AI-generated text/images at
setup; it does not prohibit them. Disclosure is private, not shown on the listing. Note the test is
who created the original, not how much you edited: heavy post-editing does **not** reclassify
AI-generated as AI-assisted. Lulu and IngramSpark have no equivalent published policy.
— <https://kdp.amazon.com/en_US/help/topic/G200672390>

---

## 3. "No profiles" — how hard is it, really?

Genuinely not bad. I inventoried every place a child's name reaches a finished file.

**The good news:**
- `visualReferences` (uploaded photo avatars) is **optional everywhere** in the illustration
  pipeline. No photos needed — the character bible plus the house style lock carry the look.
- EPUB already has non-personalised fallbacks: `epub.ts:134` and `:646` both do
  `profile ? "A story for X." : "A Storycot story."`
- `drawCopyrightPage` and `drawFrontispiecePage` take no profile at all.
- `buildPrintPdf` uses the profile **only** for front matter. Interiors are driven purely by spreads.

**Sites that bake in a name — all cheap to gate:**

| Location | String |
|---|---|
| `pdf/rendering.ts:425` | `"Created for X"` — title page *(live, unguarded)* |
| `pdf/rendering.ts:367` | `"Created for X"` — digital cover page *(live, unguarded)* |
| `pdf/builders.ts:432` | `"Created for X"` — physical cover front panel *(live, unguarded)* |
| `pdf/rendering.ts:192` | `"For X"` — half-title *(already guarded; dead in prod)* |
| `composer.ts:253` | `"Created especially for X."` *(stored, not printed)* |

**The actual work is in the body text, not the front matter.** Two places:

- `composer.ts:284` — the closing page prints `"The End.\n\nSweet dreams, <name>."`
- `composer.ts:391–505` — **seven** filler-prose variants inject the name when padding a short
  story to the target page count (e.g. `"${profile.name} looked, listened, and smiled."`)

Plus `buildCoverPdf:448–461` reprints raw story prose as the back-cover blurb.

**Recommended approach: give the book a real protagonist, not a blank.** Rather than stripping
names out, the seed brief names its own cast ("Mira, a small brave lighthouse keeper"), and we pass
a **synthetic profile** carrying that name. Then:

- Filler prose and the closing line read correctly — they're about Mira, a character.
- Front matter needs an `edition: "trade"` flag that swaps `"Created for Mira"` for an imprint line.
- `chromeLabels.ts` needs a trade variant: the tagline, back-cover blurb and footer currently say
  **"Personalised"** in all 13 locales, which is wrong on a book sold to strangers.

This is a handful of conditionals, not a rewrite — and it reuses the entire build pipeline
untouched.

**⚠️ The trap to avoid (§3.4 in v1, still the sharpest edge):** `buildStoryPrompt` (L251–265)
**silently drops** any cast member the IP filter doesn't rate `clear`, and the filter's capitalised-
name heuristic flags `"...with Captain Nimbus"`. So seeds must describe cast **relationally and in
lowercase** and let the model name them during generation. Otherwise the cast vanishes from the
prompt and you get a vague, character-less story — **with no error raised.** This needs an explicit
assertion that the cast survived.

---

## 4. Where the store actually lives

Recommendation: **Lulu Direct + Shopify.**

- It's the only route that sells your 24–72pp square colour **hardcover** with no format compromise.
  Lulu supports square trims and hardcover casewrap at 24–800pp.
- **Auto-fulfilment**: a Shopify order routes to Lulu, prints, and drop-ships white-label. You do
  not build checkout, you do not touch fulfilment.
- **No ISBN required** for your own store. No Lulu platform fee — you pay print + shipping.
- Cost: **Shopify Basic A$42–56/mo** (<https://www.shopify.com/au/pricing>).
- ⚠️ The Shopify app is polarised — 3.7/5 from 48 reviews. Test sync edge cases before launch.

**This is the key architectural point: it replaces our Stripe/fulfilment path entirely.**

That means the reusable-modules list from v1 mostly does **not** apply here. `margin.ts`,
`runFulfillment.ts`, the Lulu webhook, the Stripe checkout routes — all bypassed, because Shopify
and Lulu Direct own pricing and fulfilment now. What we reuse is the part that matters: **the book
build pipeline that produces print-ready PDFs.** Our job ends at "approved PDF + metadata pushed to
Shopify."

That is a much smaller integration than v1 assumed, and it removes the margin-floor problem, the
AU-only Stripe lock, and the shipping-economics trap in one move.

**Secondary channels, later:** Lulu Bookstore (free, no ISBN, live in minutes) as a supplementary
shopfront; KDP **paperback only** for Amazon discoverability — and if you go there, **design to
≤40pp**, because premium colour is a flat **A$6.42** for 24–40pp and then jumps to A$2.42 + A$0.10/pg
(a 72pp book costs A$9.62, forcing a ~A$16 minimum list price before any profit).

**Format note:** a 24–28pp **paperback must be saddle-stitch** on Lulu — perfect binding starts at
32pp. So the cheaper paperback option is viable, but binding depends on page count.

---

## 5. Where I'd push back

**On trends.** Trending children's content is overwhelmingly trademarked — Bluey, Pokémon,
whatever film just dropped. That is precisely what the IP guardrails reject, so a naive trend
scraper produces a queue of ideas that get redacted into mush or blocked at review. Burnt tokens,
nothing shippable.

Point the automation at **evergreen demand** instead: seasonal/calendar hooks (starting school, new
sibling, losing a tooth, Christmas), developmental themes (big feelings, sharing, bedtime
resistance), and search-shaped intent. Plus the input nobody else has — **aggregate themes from
stories your own users generate**, and `publicStoryVotes` data.

**On the guardrail gap.** Worth restating because it matters more now: `isStoryPrintRestricted()`
is only called at Stripe checkout. `POST /api/books` and `/build` have **no IP or safety check at
all.** Once books leave via Shopify, **the Stripe gate is never called** — so the only thing
standing between a restricted book and a paying stranger is your manual review. The gate must move
to **publish time** and be enforced in code, not just by eyeball.

**On volume.** Each book costs roughly **A$1.50–2.50** to generate (~17 illustrations at ~$0.08 plus
Claude). Cheap per unit — but review time is the real constraint. One excellent title a week is a
strong, sustainable pace, and a thin catalogue of good books outsells a big one of mediocre ones.

**On the "Storycot" name.** You're fine calling them Storycot. One caution: the word "Personalised"
is currently printed in the tagline, back-cover blurb and footer of every book. On a trade edition
that's actively misleading — it needs a trade variant, which is also a chance to point buyers back
at the personalised product ("Create your own at storycot.com.au" is already on the back cover).

---

## 6. Proposed phasing

### Phase 0 — De-risk (half a day, before any code)
- Open Lulu's GD eligible-products PDF and confirm 8.5×8.5 square eligibility
  (<https://assets.lulu.com/media/guides/en/lulu-global-distribution-eligible-products.pdf>).
- Pull real Lulu quotes: hardcover + paperback, 24/32/40pp, AU delivery.
- Set up a Shopify dev store and install Lulu Direct; push **one existing book** through end-to-end
  manually. **This validates the whole commercial thesis before we write a line of code.**
- Decide: own Thorpe-Bowker ISBNs vs. none (not needed for Shopify/Lulu Bookstore).

### Phase 1 — Trade edition output
- Add an `edition: "personalised" | "trade"` flag through `buildPrintPdf` / `buildCoverPdf` /
  `generateBookPdfs`.
- Gate the four `"Created for X"` sites; add trade strings to `chromeLabels.ts` (imprint line,
  non-"personalised" tagline/blurb/footer).
- Copyright page: imprint + optional ISBN instead of `"Created on <date>"`.
- Tests: assert a trade-edition PDF contains no personalisation strings.

### Phase 2 — Headless build path
- System account + synthetic profile from a seed brief (no user, no real profile, no photos).
- `trade_titles` table: seed brief, bookProjectId, status (`draft | in_review | approved |
  rejected | published`), reviewer, timestamps, store URL.
- **Extract the guardrail sequence from `runGeneration.ts` (L161–240) into a shared helper** so the
  headless path runs identical checks — no drift.
- Assert the cast survived the IP filter (the §3 trap).

### Phase 3 — Review queue (the only real UI)
- Admin-only: seed brief, cover, spread-by-spread review, PDF preview.
- Approve / decline with reason. Reuses the existing spread-review and redo tooling.
- **Publish gate enforced in code**: `assessGeneratedStoryIp` not `restricted`,
  `validatePublicStorySafety` on generated text *and* illustration prompts, proofing clean, Lulu
  assets present, human approval recorded.

### Phase 4 — Push to store
- On approve: push PDFs + metadata to Shopify via Lulu Direct, record the store URL.
- Start manual (a button that prepares the upload) before automating — the API surface is worth
  learning by hand first.

### Phase 5 — Weekly trend automation
- Weekly cron (OpenHands prompt preset — this step is genuine reasoning work).
- Inputs per §5: seasonal calendar, evergreen themes, our own generation/vote telemetry.
- Output: ranked seed briefs **into the review queue**. Proposes only — a human approves before
  anything is built. The build step itself is deterministic Inngest orchestration, not an LLM job.

Phases 1–3 are the real work. Phase 5 is deliberately last: **the automation is worthless until the
review-and-publish path exists**, and building it first would just create a pile of unreviewable drafts.

---

## 7. Open questions

1. **Shopify — happy to add ~A$50/mo?** It removes building checkout, cart, delivery and
   fulfilment entirely. I think it's clearly worth it, but it's a recurring cost and your call.
2. **Paperback, hardcover, or both at launch?** Both are viable via Lulu Direct; paperback under
   32pp must be saddle-stitch.
3. **ISBNs now or later?** Not needed for Shopify or Lulu Bookstore. Only required if you want
   Amazon/Ingram reach. Australian ISBNs aren't free (Thorpe-Bowker, roughly A$44–50 single, cheaper
   in blocks — worth confirming directly, their site blocks automated access).
4. **Does the trade book advertise the personalised product?** There's a real funnel here — a
   bookshop-quality book that converts readers into Storycot customers.
5. **How much review time per week?** This sets the honest catalogue growth rate.

---

## Appendix — key sources

- KDP hardcover 75–550pp / no AU hardcover: <https://kdp.amazon.com/en_US/help/topic/GHT976ZKSKUXBB6H>
- KDP printing costs & royalties: <https://kdp.amazon.com/en_US/help/topic/G201834340>
- KDP AI content policy: <https://kdp.amazon.com/en_US/help/topic/G200672390>
- Lulu GD rejects hardcovers at Amazon: <https://help.lulu.com/en/support/solutions/articles/64000255462>
- Lulu binding page-count limits: <https://help.lulu.com/en/support/solutions/articles/64000255480-publishing-the-basics>
- Lulu sell-on-your-site: <https://www.lulu.com/sell/sell-on-your-site>
- Shopify AU pricing: <https://www.shopify.com/au/pricing>
