# Storycot Print Book Technical Plan

## Purpose

Translate the product and composition decisions from `PRINT_BOOK_SPEC.md` into an implementation
plan that fits the current Storycot codebase.

This document is intentionally concrete. It defines:

- where new types should live
- how persistence should work
- how the async pipeline should be modeled
- which routes and services need to be added
- how to stage rollout safely

---

## Current Constraints

The existing application has these relevant characteristics:

- story generation is synchronous in `src/app/api/stories/generate/route.ts`
- stories are stored in Vercel KV through `src/lib/db.ts`
- the current `Story` model stores rendered `pages[]`, not narrative beats
- print output today is a text-only page at `src/app/[locale]/stories/[id]/print/page.tsx`
- the repository has no generic background job framework yet
- binary assets are not currently stored anywhere in app code

This means the print-book system should be added beside the current story system, not forced into
it.

---

## Architectural Direction

### Keep the existing digital story flow intact

Do not break or replace:

- `Story`
- `StoryPage`
- synchronous digital story generation
- current in-app story reading flow

These remain the low-friction product path.

### Add a parallel print-book subsystem

The print-book system should be a separate pipeline with:

- its own types
- its own persistence keys
- its own async status model
- its own UI entry points
- its own asset storage

### Introduce a composition layer

The print-book subsystem needs a narrative planning layer between text generation and final page
rendering.

That layer should:

- infer age band
- derive beats from the existing story
- compose beats into hardcover spreads
- generate visual briefs from those spreads

---

## Proposed Build Strategy

### Phase 1: Fit the current story into the new print pipeline

Use existing generated stories as source material.

That means:

- do not rewrite the current story generator first
- derive beats from `Story.pages[]` for v1
- keep digital story generation unchanged

This reduces scope sharply.

### Phase 2: Move story generation upstream to beats

Later, once the print product works:

- teach the generator to output beats directly
- derive digital pages from beats
- derive print spreads from beats

This is a stronger long-term design, but not the best first step.

---

## Data Model

## Existing types to keep

Keep in `src/types/index.ts`:

- `Story`
- `StoryPage`
- `ChildProfile`

Do not mix hardcover-specific concerns into those interfaces.

## New type file

Add a dedicated file:

- `src/types/printBook.ts`

This keeps the print model isolated from the digital story model.

## Proposed enums and unions

### `AgeBand`

```ts
export type AgeBand = '0-2' | '3-5' | '6-8'
```

### `BookProjectStatus`

```ts
export type BookProjectStatus =
  | 'queued'
  | 'planning'
  | 'bible'
  | 'illustrating'
  | 'composing'
  | 'proofing'
  | 'ready'
  | 'failed'
```

### `BookSpreadLayoutType`

```ts
export type BookSpreadLayoutType =
  | 'front_matter'
  | 'text_art'
  | 'hero'
  | 'quiet'
  | 'end_matter'
```

## Proposed interfaces

### `Beat`

V1 may derive this internally from a `Story`, but it should still be modeled explicitly.

Suggested shape:

```ts
export interface Beat {
  id: string
  sequence: number
  purpose:
    | 'setup'
    | 'invitation'
    | 'discovery'
    | 'challenge'
    | 'comfort'
    | 'resolution'
    | 'bedtime_close'
  summary: string
  textDraft: string
  visualIntent: string
  mood: 'calm' | 'playful' | 'tense' | 'wonder' | 'sleepy'
  isQuietBeat: boolean
}
```

### `CharacterBible`

```ts
export interface CharacterBible {
  childAppearance: string
  outfitRules: string
  recurringProps: string[]
  companionCharacters: string[]
  palette: string
  renderStyle: string
  lightingTone: string
  doNotChange: string[]
}
```

### `BookSpread`

```ts
export interface BookSpread {
  id: string
  bookProjectId: string
  sequence: number
  pageStart: number
  pageEnd: number
  layoutType: BookSpreadLayoutType
  title?: string
  leftPageText: string
  rightPageText: string
  sceneBrief: string
  illustrationPrompt: string
  imageUrl?: string
  thumbnailUrl?: string
}
```

### `BookAsset`

```ts
export interface BookAsset {
  coverImageUrl?: string
  previewPdfUrl?: string
  printPdfUrl?: string
  previewImages?: string[]
  proofVersion: number
}
```

### `BookProject`

```ts
export interface BookProject {
  id: string
  userId: string
  sourceStoryId: string
  profileId: string
  ageBand: AgeBand
  status: BookProjectStatus
  trimSize: string
  pageCount: number
  spreadCount: number
  completedSpreads: number
  totalSpreads: number
  currentStageLabel: string
  characterBible?: CharacterBible
  beats: Beat[]
  spreads: BookSpread[]
  assets: BookAsset
  errorCode?: string
  errorMessage?: string
  retryCount: number
  createdAt: string
  updatedAt: string
  readyAt?: string
}
```

---

## Persistence Strategy

## Short-term persistence target

Continue using Vercel KV for metadata in v1, because that matches the existing app and avoids a
database migration before the feature exists.

## Important limitation

The current `db.ts` implementation stores and rewrites whole collections such as `stories`.

That pattern is acceptable for the current small app, but it is the wrong shape for a long-running
book pipeline with nested state and many updates.

Do not store book projects as one giant `bookProjects` array.

## Recommended KV key shape for v1

Store each book project separately.

Suggested keys:

- `bookProject:{id}` -> `BookProject`
- `bookProjectByStory:{storyId}` -> `string[]` of project ids
- `bookProjectByUser:{userId}` -> `string[]` of project ids`

Optional:

- `bookProjectLock:{id}` -> short-lived lock key during processing

## `db.ts` structure

Extend `src/lib/db.ts` with a new namespace:

- `db.bookProjects`

Suggested methods:

- `getById(id)`
- `getByUserId(userId)`
- `getByStoryId(sourceStoryId)`
- `create(project)`
- `update(id, updates)`
- `replace(id, project)`

For v1, `replace` will likely be simpler than many partial nested updates.

---

## Asset Storage

## Requirement

Book images and PDFs must not live in KV.

## Recommended v1 choice

Use Vercel Blob for:

- spread illustrations
- cover illustration
- preview images
- preview PDF
- print PDF

Reasons:

- fits the current Vercel deployment model
- simple integration path from Next.js server routes
- avoids adding a second vendor just to prove the feature

## Naming convention

Suggested blob path shape:

- `books/{bookProjectId}/cover.png`
- `books/{bookProjectId}/spreads/{sequence}.png`
- `books/{bookProjectId}/preview.pdf`
- `books/{bookProjectId}/print.pdf`
- `books/{bookProjectId}/preview/{page}.png`

---

## Service Layer

Create a dedicated print-book library area:

- `src/lib/print-books/`

Suggested files:

- `ageBand.ts`
- `beats.ts`
- `composer.ts`
- `characterBible.ts`
- `illustrations.ts`
- `pdf.ts`
- `status.ts`
- `storage.ts`

This keeps the subsystem from bloating `storyGenerator.ts` or `db.ts`.

## Responsibilities

### `ageBand.ts`

- infer age band from `ChildProfile`

### `beats.ts`

- derive v1 beats from existing `Story.pages[]`
- later accept native beat generation

### `composer.ts`

- transform beats into the 32-page hardcover spread plan

### `characterBible.ts`

- create or derive a stable visual identity package for the book

### `illustrations.ts`

- generate and upload cover/spread images
- update spread records as each image completes

### `pdf.ts`

- render print-ready PDF
- optionally render preview images or a screen preview PDF

### `status.ts`

- map machine statuses to magical user-facing labels

### `storage.ts`

- hide Blob-specific upload/download details from the rest of the subsystem

---

## API Surface

Add a new resource family:

- `src/app/api/books/`

## Proposed routes

### `POST /api/books`

Purpose:

- create a new `BookProject` from a source story
- validate ownership
- initialize async build state

Request body:

```json
{
  "sourceStoryId": "uuid"
}
```

Response:

- `201` with created `BookProject`

### `GET /api/books`

Purpose:

- list book projects for the signed-in user

### `GET /api/books/[id]`

Purpose:

- fetch one book project with spreads, assets, and status

### `POST /api/books/[id]/build`

Purpose:

- start or restart async generation

This could be folded into `POST /api/books`, but keeping it separate is cleaner if we later support
draft projects or manual retries.

### `POST /api/books/[id]/retry`

Purpose:

- retry a failed build

### `GET /api/books/[id]/status`

Purpose:

- lightweight polling endpoint for progress

### `GET /api/books/[id]/preview`

Purpose:

- return metadata for preview assets or redirect to the preview PDF

---

## Async Execution Model

## Requirement

The UI should not hold open a single request for the whole book build.

## V1 execution choices

There are three realistic choices:

1. in-process async runner
2. Vercel cron or scheduled worker pattern
3. external queue/worker system

## Recommended v1 choice

Use a simple in-app job runner pattern first, driven by explicit route calls.

Shape:

- `POST /api/books/[id]/build` triggers the pipeline
- the pipeline updates `bookProject:{id}` status after each stage
- the UI polls `GET /api/books/[id]/status`

This is not the final ideal worker architecture, but it is the smallest useful system for proving
the product.

## Important caveat

Long-running serverless limits may make a one-shot build route too fragile once image generation and
PDF rendering grow.

So implement the pipeline as resumable stage functions from the start.

Meaning:

- each stage should be restartable
- state should be persisted after every stage
- failures should leave enough progress to resume or retry

## Recommended stage functions

- `planBook(projectId)`
- `buildCharacterBible(projectId)`
- `generateIllustrations(projectId)`
- `composePdf(projectId)`
- `proofBook(projectId)`

The `build` route can orchestrate them for v1, but the functions should be usable later from a
real queue worker without redesign.

---

## Pipeline Details

## 1. Create project

Triggered by:

- `POST /api/books`

Steps:

- authenticate user
- fetch source story
- fetch profile
- infer `ageBand`
- create initial `BookProject` with `queued` status

## 2. Plan book

Triggered by:

- `POST /api/books/[id]/build`

Steps:

- set status to `planning`
- derive beats from source story
- compose spreads from beats
- create spread records inside the project

## 3. Build character bible

Steps:

- set status to `bible`
- generate canonical visual description
- persist `characterBible`

## 4. Generate illustrations

Steps:

- set status to `illustrating`
- generate cover first
- generate spreads in sequence
- upload each asset to Blob
- update `completedSpreads` after every success

## 5. Compose PDF

Steps:

- set status to `composing`
- fetch spread text and image assets
- render preview PDF
- render print PDF
- upload both

## 6. Proofing

Steps:

- set status to `proofing`
- run automated checks on minimum required assets and page counts
- ensure every required spread has an image and text payload

## 7. Ready

Steps:

- set status to `ready`
- set `readyAt`
- expose preview/download links

## Failure handling

If any stage fails:

- set status to `failed`
- persist `errorCode`, `errorMessage`
- leave completed work intact where safe

---

## Rendering Strategy

## V1 goal

Generate one high-quality PDF that is already safe enough for Lulu-targeted output.

## Implementation shape

Add a PDF rendering utility in:

- `src/lib/print-books/pdf.ts`

Potential implementation approaches:

1. HTML-to-PDF rendering using app templates
2. direct PDF generation library

## Recommended v1 choice

Use HTML/CSS layouts rendered in a controlled server context, then export to PDF.

Reason:

- the team is already in a Next.js/Tailwind stack
- spread layouts are easier to design and iterate as HTML
- print templates can mirror future preview UI

## Important requirement

Keep print layout code separate from the existing text-only print page.

Suggested location for print templates:

- `src/app/book-preview/` for internal render pages
or
- `src/lib/print-books/templates/` if rendered outside standard routes

---

## UI Plan

## Entry points

Add a print-book action to the story detail page:

- `Create print book`

Relevant existing page:

- `src/app/[locale]/stories/[id]/page.tsx`

## New user surfaces

### Book project detail page

Suggested route:

- `src/app/[locale]/books/[id]/page.tsx`

Shows:

- status
- magical progress copy
- spread count progress
- preview readiness
- retry if failed
- download when ready

### Book list page

Suggested route:

- `src/app/[locale]/books/page.tsx`

Shows:

- all book projects for the user
- build states
- ready books

## Polling model

V1 should use polling, not websockets.

Reason:

- lower complexity
- sufficient for long-running jobs
- consistent with the current stack

Suggested cadence:

- poll every `3-5` seconds while status is non-terminal

---

## Billing Hook Points

Do not wire billing deeply into the pipeline yet.

But preserve an insertion point before `build` can start.

Suggested future model:

- project created in `queued` or `awaiting_payment`
- build allowed only after premium entitlement is verified

This keeps the technical design compatible with either:

- separate checkout product
- premium credit

Current recommendation remains:

- separate checkout product

---

## Rollout Order

## Step 1: Types and persistence

- add `src/types/printBook.ts`
- extend `src/lib/db.ts` with `bookProjects`

## Step 2: Age band and beat derivation

- implement `ageBand.ts`
- implement v1 beat derivation from `Story.pages[]`

## Step 3: Spread composer

- implement 32-page composition rules
- persist `BookSpread[]`

## Step 4: API scaffolding

- add create/get/status/build routes

## Step 5: Placeholder async flow

- implement status transitions without real images first
- prove project creation and UI polling

## Step 6: Asset storage integration

- integrate Vercel Blob
- store placeholder or test assets

## Step 7: Illustration generation

- add cover generation
- add spread image generation

## Step 8: PDF composition

- generate preview and print PDFs

## Step 9: UI polish

- add magical progress language
- preview/download UX

## Step 10: Billing gate

- add premium purchase enforcement before builds

This order reduces risk and keeps failures narrow.

---

## Risks

## 1. KV update patterns

The current KV design is simplistic.

Risk:

- high write frequency during image generation could become awkward

Mitigation:

- one key per project
- replace whole project object atomically in controlled places

## 2. Serverless timeouts

Risk:

- full illustration plus PDF generation may exceed route limits

Mitigation:

- stage-based resumable functions
- keep orchestration boundaries explicit from v1

## 3. Character drift across images

Risk:

- inconsistent child appearance reduces product quality fast

Mitigation:

- generate character bible first
- keep cover and spread prompts anchored to the same rules

## 4. Layout complexity

Risk:

- print-safe PDF generation is harder than digital preview

Mitigation:

- bias toward a narrow set of spread layouts in v1
- mostly `text_art`, limited hero variations

## 5. Product cost mismatch

Risk:

- hardcover generation costs may not fit current credit economics

Mitigation:

- keep billing separate from digital story credits

---

## Suggested Immediate Follow-Up

The next implementation-ready artifact should be a task breakdown with issue-sized chunks:

1. add print book types
2. add KV persistence helpers
3. build age-band utility
4. build beat derivation
5. build hardcover composer
6. build API skeleton
7. add book UI pages
8. integrate Blob
9. integrate image generation
10. build PDF renderer

That breakdown can then become the actual branch plan.
