# Storycot Print Book Backlog

## Purpose

Break the print-book feature into issue-sized implementation tasks with explicit dependencies,
acceptance criteria, and rollout order.

This backlog assumes the direction defined in:

- `docs/PRINT_BOOK_SPEC.md`
- `docs/PRINT_BOOK_TECHNICAL_PLAN.md`

---

## Delivery Strategy

Build the hardcover system in thin vertical slices.

Do not start with image generation or Lulu ordering.

The first objective is to prove that Storycot can:

1. create a `BookProject`
2. plan a hardcover book from an existing story
3. track async progress
4. render a preview artifact

Only after those work should illustration generation and billing be added.

---

## Phase 0: Ground Rules

### PB-00: Lock print-book scope in docs

Status:

- done in docs

Artifacts:

- `docs/PRINT_BOOK_SPEC.md`
- `docs/PRINT_BOOK_TECHNICAL_PLAN.md`

Acceptance criteria:

- age bands are defined
- hardcover is fixed at 32 pages
- spread-first model is documented
- async pipeline direction is documented

---

## Phase 1: Types and Persistence

### PB-01: Add print-book shared types

Goal:

- create a dedicated print-book type module

Suggested files:

- `src/types/printBook.ts`

Scope:

- add `AgeBand`
- add `BookProjectStatus`
- add `BookSpreadLayoutType`
- add `Beat`
- add `CharacterBible`
- add `BookSpread`
- add `BookAsset`
- add `BookProject`

Dependencies:

- none

Acceptance criteria:

- project builds with the new type module present
- no changes required to existing `Story` or `StoryPage` interfaces

### PB-02: Add `db.bookProjects` KV helpers

Goal:

- persist book metadata without using a global array

Suggested files:

- `src/lib/db.ts`
- optional `src/tests/*`

Scope:

- add `bookProjects` namespace
- add per-project key storage
- add lookup helpers by id, user, and source story

Dependencies:

- PB-01

Acceptance criteria:

- can create, fetch, and update a book project
- each project is stored under its own KV key
- no binary assets are stored in KV

---

## Phase 2: Narrative Planning

### PB-03: Add age-band inference utility

Goal:

- infer the print planning age band from `ChildProfile`

Suggested files:

- `src/lib/print-books/ageBand.ts`
- `src/tests/print-books/ageBand.test.ts`

Scope:

- map profile age to `0-2`, `3-5`, or `6-8`
- centralize the logic in one utility

Dependencies:

- PB-01

Acceptance criteria:

- age boundary rules are covered by unit tests
- utility works with both `age` and `dateOfBirth`-derived age

### PB-04: Add v1 beat derivation from existing stories

Goal:

- derive print-planning beats from `Story.pages[]`

Suggested files:

- `src/lib/print-books/beats.ts`
- `src/tests/print-books/beats.test.ts`

Scope:

- group or transform existing story pages into beats
- annotate beats with purpose, mood, and visual intent
- keep logic deterministic for v1

Dependencies:

- PB-01
- PB-03

Acceptance criteria:

- given a story, the function returns a stable beat sequence
- shorter and longer stories both produce usable beats
- no external API calls are required in v1 beat derivation

### PB-05: Add hardcover spread composer

Goal:

- map beats to a fixed 32-page hardcover layout

Suggested files:

- `src/lib/print-books/composer.ts`
- `src/tests/print-books/composer.test.ts`

Scope:

- generate front matter and end matter
- allocate story spreads by age band
- assign `text_art`, `hero`, and `quiet` spread types
- produce `BookSpread[]`

Dependencies:

- PB-01
- PB-03
- PB-04

Acceptance criteria:

- output always composes to 32 pages
- younger age bands result in more breathing-room spreads
- spread allocation is deterministic from the same input story

---

## Phase 3: API Skeleton and Status Flow

### PB-06: Add book project creation route

Goal:

- let a signed-in user create a `BookProject` from an existing story

Suggested files:

- `src/app/api/books/route.ts`

Scope:

- implement `POST /api/books`
- validate story ownership
- infer profile and age band
- create initial queued project

Dependencies:

- PB-01
- PB-02
- PB-03

Acceptance criteria:

- unauthorized requests return `401`
- non-owned stories return `404` or equivalent ownership failure
- valid requests create a queued project

### PB-07: Add book fetch and status routes

Goal:

- support listing and polling from the UI

Suggested files:

- `src/app/api/books/route.ts`
- `src/app/api/books/[id]/route.ts`
- `src/app/api/books/[id]/status/route.ts`

Scope:

- `GET /api/books`
- `GET /api/books/[id]`
- `GET /api/books/[id]/status`

Dependencies:

- PB-02
- PB-06

Acceptance criteria:

- users can only read their own book projects
- status route returns lightweight machine-readable progress fields

### PB-08: Add status-label mapping utility

Goal:

- centralize the magical user-facing progress copy

Suggested files:

- `src/lib/print-books/status.ts`
- `src/tests/print-books/status.test.ts`

Scope:

- map machine states to UI labels
- keep stage labels stable across UI surfaces

Dependencies:

- PB-01

Acceptance criteria:

- all non-terminal states have a user-facing label
- labels can be consumed consistently from API responses or UI helpers

---

## Phase 4: Non-Illustrated Pipeline Proof

### PB-09: Add build orchestration route with planning-only pipeline

Goal:

- prove the async flow before image generation exists

Suggested files:

- `src/app/api/books/[id]/build/route.ts`
- `src/lib/print-books/*`

Scope:

- implement planning-only build
- set statuses `planning -> composing -> ready`
- create beats and spreads
- produce placeholder or metadata-only assets if needed

Dependencies:

- PB-04
- PB-05
- PB-07
- PB-08

Acceptance criteria:

- a queued book can be built into a ready project without illustrations
- the UI can observe stage changes through polling
- failures persist error fields

### PB-10: Add book project UI pages

Goal:

- expose the print-book flow to signed-in users

Suggested files:

- `src/app/[locale]/books/page.tsx`
- `src/app/[locale]/books/[id]/page.tsx`
- related components

Scope:

- book list page
- book detail/progress page
- polling while build is active
- ready/failed states

Dependencies:

- PB-07
- PB-08
- PB-09

Acceptance criteria:

- users can see queued, in-progress, ready, and failed book states
- progress feels alive but is backed by real machine state

### PB-11: Add story-page entry point for print books

Goal:

- connect existing story detail pages to the new book flow

Suggested files:

- `src/app/[locale]/stories/[id]/page.tsx`
- related components

Scope:

- add `Create print book` action
- redirect or link to the created book project

Dependencies:

- PB-06
- PB-10

Acceptance criteria:

- a user can start a print-book project directly from a story page

---

## Phase 5: Asset Storage and Placeholder Rendering

### PB-12: Add Blob storage helper layer

Goal:

- isolate binary storage concerns behind a small service API

Suggested files:

- `src/lib/print-books/storage.ts`
- `src/tests/print-books/storage.test.ts` if practical

Scope:

- define upload helpers
- define path naming conventions
- hide Blob-specific details from the rest of the subsystem

Dependencies:

- PB-01

Acceptance criteria:

- helper can store and return URLs for book assets
- storage path conventions are centralized

### PB-13: Add preview rendering scaffold

Goal:

- prove the book can render as a structured artifact before real illustrations

Suggested files:

- `src/lib/print-books/pdf.ts`
- print preview template files

Scope:

- render a basic preview PDF or HTML-derived print artifact
- use placeholder panels where images are not available yet

Dependencies:

- PB-05
- PB-09
- PB-12

Acceptance criteria:

- a ready project includes a preview artifact
- output respects the 32-page layout map

---

## Phase 6: Character Bible and Illustration Generation

### PB-14: Add character bible generation

Goal:

- establish stable visual identity before spread images are created

Suggested files:

- `src/lib/print-books/characterBible.ts`

Scope:

- generate the canonical visual brief
- persist it into the project

Dependencies:

- PB-01
- PB-04
- PB-05

Acceptance criteria:

- each project has one stable character bible before illustration begins

### PB-15: Add cover illustration generation

Goal:

- generate the cover as the first real image asset

Suggested files:

- `src/lib/print-books/illustrations.ts`

Scope:

- generate cover prompt from project + character bible
- upload cover to Blob
- persist cover URL

Dependencies:

- PB-12
- PB-14

Acceptance criteria:

- book project stores a cover image URL
- build status and error state update correctly on failure

### PB-16: Add spread illustration generation

Goal:

- generate and persist interior spread images

Suggested files:

- `src/lib/print-books/illustrations.ts`

Scope:

- derive prompts from `BookSpread + CharacterBible`
- upload images one spread at a time
- update `completedSpreads`

Dependencies:

- PB-12
- PB-14
- PB-15

Acceptance criteria:

- each required visual spread gets an image URL
- progress increments spread by spread
- partial failures are resumable

---

## Phase 7: Real PDF Output

### PB-17: Add print-ready PDF composition

Goal:

- generate the Lulu-oriented final PDF

Suggested files:

- `src/lib/print-books/pdf.ts`

Scope:

- render final PDF from spreads and assets
- upload preview and print files
- persist resulting asset URLs

Dependencies:

- PB-13
- PB-16

Acceptance criteria:

- ready book projects expose preview and print PDF URLs
- output uses final image assets, not placeholders

### PB-18: Add automated proof checks

Goal:

- catch incomplete projects before they are presented as order-ready

Suggested files:

- `src/lib/print-books/proof.ts`
- associated tests

Scope:

- verify page count
- verify required assets exist
- verify all required spreads have text payloads

Dependencies:

- PB-17

Acceptance criteria:

- proofing failure prevents `ready` status
- proof results are inspectable in project state

---

## Phase 8: Billing Gate

### PB-19: Add premium entitlement gate before build

Goal:

- ensure print-book builds are not treated like ordinary story credits

Suggested files:

- billing route(s)
- `src/app/api/books/[id]/build/route.ts`

Scope:

- check entitlement before starting build
- keep room for future checkout-product integration

Dependencies:

- PB-09

Acceptance criteria:

- unauthorized non-paying users cannot start a premium build
- gated users get a clear failure state or upgrade path

---

## Phase 9: Lulu Integration

### PB-20: Add Lulu-ready export validation

Goal:

- verify that generated PDFs match the selected Lulu hardcover target

Scope:

- lock trim size and page assumptions
- validate export metadata

Dependencies:

- PB-17
- PB-18

Acceptance criteria:

- the project can confirm whether a print PDF is export-valid for the chosen Lulu format

### PB-21: Add physical order flow

Goal:

- automate the “print this for me” path after the artifact is already stable

Scope:

- order intent
- shipping flow
- order status tracking

Dependencies:

- PB-19
- PB-20

Acceptance criteria:

- physical ordering is separated from book generation
- failed orders do not destroy the generated book artifact

---

## Recommended First Build Sequence

If work starts immediately, the best first branch sequence is:

1. PB-01
2. PB-02
3. PB-03
4. PB-04
5. PB-05
6. PB-06
7. PB-07
8. PB-08
9. PB-09
10. PB-10
11. PB-11

This gets Storycot to a non-illustrated, async hardcover planner with visible progress.

That is the right first proof because it validates:

- data model
- ownership rules
- async UX
- composition logic

before spending money and complexity on image generation.

---

## Definition of “First Usable Internal Milestone”

Storycot has reached its first meaningful internal milestone when:

- a user can open an existing story
- create a print-book project
- watch the project move through async stages
- receive a 32-page composed preview artifact
- retry or inspect a failed project

No illustrations or Lulu ordering are required for that milestone.

---

## Notes

- Keep the current text-only print flow intact until the new hardcover path is viable
- Avoid mixing print-book logic into `storyGenerator.ts`
- Avoid expanding the current `stories` KV array pattern to book projects
- Prefer deterministic v1 planning logic before adding more AI stages
