# Storycot Print Book Spec

## Purpose

Define the first production-ready print book model for Storycot.

This spec introduces a separate hardcover book pipeline that is built from a digital story but is
not constrained by the current text-first `Story.pages[]` structure.

The primary target is a Lulu-compatible hardcover product with a fixed 32-page format.

---

## Product Positioning

Storycot should treat these as separate products:

- `Digital story`
  - Fast generation
  - Age-adaptive length
  - Read in app
  - Existing PDF print view can continue to exist
- `Hardcover print book`
  - Premium product
  - 32-page fixed-format artifact
  - Illustrated
  - Generated asynchronously
  - Designed around Lulu requirements from day one

The fixed 32-page requirement belongs to the hardcover product, not to the underlying narrative.

---

## Core Decisions

### 1. Narrative length is age-dependent

Story length should change based on the child's age and reading mode.

### 2. Hardcover length is manufacturing-dependent

The hardcover product must always compose into a 32-page artifact.

### 3. Composition is a separate layer

The system should generate an age-appropriate narrative core, then map that core into one or more
output formats:

- digital story
- downloadable PDF
- 32-page hardcover book
- future board book variant

### 4. Spread-first layout

The hardcover product should be designed around spreads, not isolated single pages.

This gives:

- better pacing for a children's book
- fewer illustrations than page-by-page design
- simpler layout constraints
- better alignment with print composition and QA

### 5. Hardcover generation is asynchronous

Digital story creation may become streamed or more conversational later.

Hardcover book generation should remain an asynchronous job because it needs:

- multiple illustration requests
- persistent progress state
- retries
- final PDF assembly
- resumability after refresh or disconnect

---

## Age Bands

The system should assign an age band from the child profile before planning the narrative.

### Band A: Ages 0-2

Characteristics:

- very short language
- strong repetition
- low plot complexity
- high illustration density
- board-book tone

Narrative target:

- `6` core spreads

Notes:

- This age group is a poor fit for forcing longer prose
- Hardcover remains possible, but should use more breathing room, repeated motifs, and extra visual
  pacing to fill the 32-page print format gracefully
- A future dedicated board-book product should be considered separately

### Band B: Ages 3-5

Characteristics:

- short bedtime arc
- simple conflict and resolution
- warm, soothing ending
- moderate repetition

Narrative target:

- `10` core spreads

### Band C: Ages 6-8

Characteristics:

- fuller story progression
- more scene variety
- more developed emotional arc
- higher text density

Narrative target:

- `12` core spreads

### Out of Scope for v1

- ages `9+`
- non-hardcover manufacturing formats
- custom page counts per printer

---

## Narrative Model

The hardcover pipeline should not depend on `Story.pages[]` as the source of truth.

Instead, it should introduce a narrative model based on beats.

### Proposed concept: `Beat`

Each beat represents one unit of narrative intent, not one rendered page.

Suggested fields:

- `id`
- `sequence`
- `purpose`
  - setup
  - invitation
  - discovery
  - challenge
  - comfort
  - resolution
  - bedtime close
- `summary`
- `textDraft`
- `visualIntent`
- `mood`
- `isQuietBeat`

The digital reader and hardcover composer can both derive outputs from the same beat sequence.

---

## Hardcover Book Structure

Hardcover output must always compose to `32` pages.

### Page Map

1. Front cover
2. Inside front / blank / printer-safe page
3. Title page
4. Dedication / created-for page
5-28. Story interior
29. Calm ending / The End
30. Storycot closing page
31. Inside back / blank / printer-safe page
32. Back cover

### Story Interior

The story interior should be built from spreads.

For v1:

- use `12` story spreads maximum for the interior planning model
- allow the composer to expand shorter stories with:
  - breathing-space art spreads
  - quiet transition spreads
  - recap or reflection lines
  - low-text visual pauses

This avoids making younger stories feel unnaturally padded with extra prose.

---

## Spread Types

Each hardcover spread should be one of a small number of layout types.

### `text_art`

- left page: text-led
- right page: illustration-led

Use as the default v1 layout.

### `hero`

- illustration-led spread
- very short text, or no text on one page

Use for emotional peaks or major scene changes.

### `quiet`

- low text density
- calming visual pacing

Use for younger age bands and the lead-in to bedtime closure.

### `front_matter`

- title
- dedication
- credits if needed

### `end_matter`

- ending page
- Storycot marker page

V1 should bias heavily toward `text_art`, with only `2-3` hero spreads per book.

---

## Composition Rules

The composer should transform a beat sequence into the 32-page hardcover shape.

### Inputs

- source story
- child age band
- story premise
- beat sequence
- character bible

### Outputs

- ordered `BookSpread[]`
- cover brief
- final page allocation
- illustration briefs for each visual spread

### Composition principles

1. Never increase prose density just to hit 32 pages
2. Prefer additional visual breathing room over forced extra text
3. Preserve a calm landing in the final spreads
4. Younger age bands should get more whitespace and more image-led pacing
5. Older age bands can carry denser text blocks and more distinct story turns

### Expected spread planning by band

#### Ages 0-2

- `6` core narrative spreads
- more quiet spreads
- more hero/visual pacing
- higher repetition tolerance

#### Ages 3-5

- `10` core narrative spreads
- mostly `text_art`
- `2` hero spreads

#### Ages 6-8

- `12` core narrative spreads
- denser text blocks
- `2-3` hero spreads

---

## Visual Consistency Model

The hardest part of the hardcover product is consistent illustration across the full book.

V1 should generate a `CharacterBible` before generating individual spread images.

### Proposed concept: `CharacterBible`

Suggested fields:

- `childAppearance`
- `outfitRules`
- `recurringProps`
- `companionCharacters`
- `palette`
- `renderStyle`
- `lightingTone`
- `doNotChange`

Purpose:

- keep the child recognizable across every spread
- keep clothing, palette, and environment stable
- reduce drift between images

Every spread illustration prompt should inherit from the same character bible plus spread-specific
scene instructions.

---

## Async Job Model

Hardcover generation must be a persistent async workflow.

### Internal statuses

- `queued`
- `planning`
- `bible`
- `illustrating`
- `composing`
- `proofing`
- `ready`
- `failed`

### User-facing status copy

These should feel magical, while still mapping to concrete job states.

- `Dreaming up the adventure...`
- `Sketching your little hero...`
- `Painting moonlit pages...`
- `Weaving the story into a real book...`
- `Tucking the final pages into place...`

### Progress tracking

The system should also keep machine-readable progress fields:

- `currentStage`
- `completedSpreads`
- `totalSpreads`
- `lastUpdatedAt`
- `errorCode`
- `retryCount`

User-facing copy should never be the only source of state.

---

## Data Model Split

The current `Story` model should remain focused on digital reading.

The hardcover product needs separate types and persistence.

### Existing digital model

Keep:

- `Story`
- `StoryPage`

Do not overload `Story.pages[]` with print-only state.

### Proposed print model

#### `BookProject`

Suggested fields:

- `id`
- `userId`
- `sourceStoryId`
- `profileId`
- `ageBand`
- `status`
- `trimSize`
- `pageCount`
- `spreadCount`
- `characterBible`
- `createdAt`
- `updatedAt`
- `readyAt`

#### `BookSpread`

Suggested fields:

- `id`
- `bookProjectId`
- `sequence`
- `layoutType`
- `leftPageText`
- `rightPageText`
- `sceneBrief`
- `illustrationPrompt`
- `imageUrl`
- `thumbnailUrl`

#### `BookAsset`

Suggested fields:

- `bookProjectId`
- `coverImageUrl`
- `previewPdfUrl`
- `printPdfUrl`
- `previewImages[]`
- `proofVersion`

This model should live beside the digital story system, not inside it.

---

## Storage and Rendering

### Storage

Binary assets should not be stored in Vercel KV.

Use blob/object storage for:

- cover images
- spread images
- preview renders
- final PDFs

KV may still hold lightweight metadata and project status.

### Rendering

The print pipeline should produce:

- a downloadable preview PDF
- a print-ready Lulu PDF

The preview and print PDFs may eventually diverge if print bleed, crop, or barcode constraints
require it, but v1 can treat them as the same generated artifact if the layout is already printer
safe.

---

## UX Flow

### Recommended v1 flow

1. User generates a digital story
2. User sees `Read now` and `Create print book`
3. User starts a print book build
4. Async job begins
5. User sees magical progress updates with real spread counts underneath
6. User returns to a ready state with:
   - preview
   - PDF download
   - later: order printed copy

### Important UX principle

Do not make the premium path feel coercive.

Users should still be able to get a PDF artifact before Storycot automates physical ordering.

This keeps the premium positioning honest while preserving the convenience value of an automated
print option.

---

## Pricing Direction

Do not treat the hardcover product like a normal story credit.

Reason:

- illustration costs are materially different from text generation costs
- async book assembly is more expensive and more failure-prone
- physical ordering adds a separate commercial layer

Recommended direction:

- digital stories remain credit-based
- hardcover book creation becomes a separate premium purchase or checkout product

This decision should remain explicit in future billing work.

---

## Non-Goals for v1

- direct Lulu ordering
- board-book manufacturing flow
- per-age printer page counts
- live streamed long-running book generation request
- reworking the current digital story reader around the print model

---

## Open Questions

1. Which exact trim size should be the default Lulu hardcover target?
2. Should dedication pages be editable by the purchaser?
3. Should the print builder always regenerate text into beats, or can it transform an existing
   digital story output deterministically?
4. How much human QA should exist before enabling automated physical orders?
5. Should the first premium artifact include both print PDF and screen-optimized PDF, or only one?

---

## Recommended Next Step

Before implementation:

1. Lock the age-band rules
2. Lock the 32-page hardcover composition map
3. Lock the print data model
4. Choose the storage layer for image and PDF assets
5. Decide whether the premium product is credit-based or checkout-based

After those decisions, implementation can begin without mixing digital story concerns into the
hardcover system.
