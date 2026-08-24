export type AgeBand =
  | "baby-drift"
  | "little-listener"
  | "toddler-tale"
  | "first-adventure"
  | "preschool-story"
  | "big-kid-chapter"
  | "young-reader-short"
  | "young-reader-classic"
  | "young-reader-long"
  | "0-2"
  | "3-5"
  | "6-8";

export type BookProjectStatus =
  | "queued"
  | "planning"
  | "bible"
  | "illustrating"
  | "composing"
  | "proofing"
  | "ready"
  | "failed";

export type BookBuildMode = "full" | "art" | "exports" | "finalize";
export type BookBuildJobStatus = "queued" | "running" | "completed" | "failed";

export type BookArtMode = "placeholder" | "generated" | "mixed";

export type BookOrderabilityState =
  "draft_only" | "export_ready" | "order_ready";

export type OpenAIImageBatchStatus =
  | "validating"
  | "failed"
  | "in_progress"
  | "finalizing"
  | "completed"
  | "expired"
  | "cancelling"
  | "cancelled";

export interface OpenAIImageBatchAsset {
  batchId: string;
  inputFileId: string;
  outputFileId?: string;
  errorFileId?: string;
  status: OpenAIImageBatchStatus;
  model: string;
  requestCount: number;
  submittedAt: string;
  lastCheckedAt?: string;
  completedAt?: string;
}

export interface ProofingCheck {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export type BookSpreadLayoutType =
  "front_matter" | "text_art" | "hero" | "quiet" | "text_only" | "end_matter";

export type BeatPurpose =
  | "setup"
  | "invitation"
  | "discovery"
  | "challenge"
  | "comfort"
  | "resolution"
  | "bedtime_close";

export type BeatMood = "calm" | "playful" | "tense" | "wonder" | "sleepy";

export interface Beat {
  id: string;
  sequence: number;
  purpose: BeatPurpose;
  summary: string;
  textDraft: string;
  visualIntent: string;
  mood: BeatMood;
  isQuietBeat: boolean;
}

export interface CharacterBible {
  childAppearance: string;
  outfitRules: string;
  recurringProps: string[];
  companionCharacters: string[];
  palette: string;
  renderStyle: string;
  lightingTone: string;
  doNotChange: string[];
  lockedCharacterRules?: LockedCharacterRule[];
}

export interface SceneLocation {
  id: string;
  /** Human-readable label, e.g. "Grandma's House (Lounge)". */
  name: string;
  /** The broad place, e.g. "Grandma's House", "Playground", "Car". */
  place: string;
  /** The specific sub-area within the place, e.g. "Lounge", "Nursery". */
  area?: string;
  summary: string;
  fixedElements: string[];
  lighting: string;
  palette: string;
  doNotChange: string[];
  /**
   * Optional parent-supplied ground-truth about this place. Treated as
   * authoritative over the AI-inferred description when present.
   */
  notes?: string;
  /**
   * Optional parent-supplied reference photo of this place. When present it is
   * added to the illustration conditioning sheet so the drawn setting matches
   * the real location.
   */
  referenceImageUrl?: string;
}

export interface LocationBible {
  locations: SceneLocation[];
  /**
   * Maps a story page number (from the source story) to a location id in
   * `locations`. Pages that revisit an earlier place point at the same id so
   * the setting is redrawn consistently (e.g. home → outside → home).
   */
  pageLocations: Record<number, string>;
}

export interface LockedCharacterRule {
  id: string;
  name: string;
  role: "main_child" | "family_friend_pet";
  relationship?: string;
  identityRules: string;
  outfitRules: string;
  continuityRules: string[];
}

export interface CharacterVisualReference {
  id: string;
  name: string;
  role: "main_child" | "family_friend_pet";
  relationship?: string;
  imageUrl: string;
  appearance?: string;
  isStale?: boolean;
}

export interface ContinuityVisualReference {
  id: string;
  label: string;
  imageUrl: string;
  source: "cover" | "spread";
  sequence?: number;
}

export interface LocationVisualReference {
  id: string;
  label: string;
  imageUrl: string;
}

export interface IllustrationGenerationMetadata {
  provider: "openai" | "placeholder";
  generatedAt: string;
  referenceSnapshotKey?: string;
  characterReferenceIds: string[];
  characterReferenceNames: string[];
  continuityReferenceIds: string[];
  continuityReferenceLabels: string[];
  staleCharacterReferenceNames?: string[];
  correctionNote?: string;
  pageTextOmitted?: boolean;
}

export interface BookSpread {
  id: string;
  bookProjectId: string;
  sequence: number;
  pageStart: number;
  pageEnd: number;
  layoutType: BookSpreadLayoutType;
  title?: string;
  leftPageText: string;
  rightPageText: string;
  sceneBrief: string;
  illustrationPrompt: string;
  /** Location id (from the project's LocationBible) this spread is set in. */
  locationId?: string;
  imageUrl?: string;
  leftPageImageUrl?: string;
  leftPageWebImageUrl?: string;
  rightPageImageUrl?: string;
  leftPageImageError?: string;
  rightPageImageError?: string;
  thumbnailUrl?: string;
  leftPageQa?: IllustrationGenerationMetadata;
  rightPageQa?: IllustrationGenerationMetadata;
}

export interface BookAsset {
  coverImageUrl?: string;
  coverPdfUrl?: string;
  coverPdfReadyForOrdering?: boolean;
  coverPdfSpineWidthIn?: number;
  coverPdfSpineSource?: "configured" | "storycot_estimate";
  coverPdfPageWidthIn?: number;
  coverPdfPageHeightIn?: number;
  coverSpineTextIncluded?: boolean;
  previewPdfUrl?: string;
  previewPdfPageWidthIn?: number;
  previewPdfPageHeightIn?: number;
  printPdfUrl?: string;
  epubUrl?: string;
  printPdfPageWidthIn?: number;
  printPdfPageHeightIn?: number;
  luluCoverPdfUrl?: string;
  luluCoverPdfPageWidthIn?: number;
  luluCoverPdfPageHeightIn?: number;
  luluCoverPdfSpineWidthIn?: number;
  luluPrintPdfUrl?: string;
  luluPrintPdfPageWidthIn?: number;
  luluPrintPdfPageHeightIn?: number;
  luluPrintPdfPageCount?: number;
  interiorTextSafeMarginIn?: number;
  previewImages?: string[];
  artMode?: BookArtMode;
  exportVersion?: number;
  finalExportVersion?: number;
  lastBuildMode?: BookBuildMode;
  activeJobId?: string;
  activeJobMode?: BookBuildMode;
  activeJobStatus?: BookBuildJobStatus;
  activeJobUpdatedAt?: string;
  artGenerationCursor?: number;
  artGenerationTotal?: number;
  referenceSnapshotKey?: string;
  referenceImageCount?: number;
  openAIImageBatch?: OpenAIImageBatchAsset;
  orderabilityState?: BookOrderabilityState;
  finalizedAt?: string;
  bookReadyEmailSentAt?: string;
  downloadableFilesArchivedAt?: string;
  downloadableFilesArchiveReason?: "retention" | "manual";
  exportProfile?: string;
  proofingPassed?: boolean;
  proofingChecks?: ProofingCheck[];
  proofingWarnings?: string[];
  proofingErrors?: string[];
  proofVersion: number;
  coverWebImageUrl?: string;
  digitalDownloadUnlockedAt?: string;
  digitalDownloadCheckoutSessionId?: string;
}

export interface BookBilling {
  product: "illustrated_book";
  status: "reserved" | "captured" | "refunded";
  credits: number;
  reservedAt?: string;
  capturedAt?: string;
  refundedAt?: string;
}

export interface PrintBookOrder {
  productKey: "hardcover";
  productLabel: string;
  provider: string;
  format: string;
  status: "checkout_started" | "paid" | "refunded";
  amountAud: number;
  subtotalAud?: number;
  shippingAmountAud?: number;
  pageCount: number;
  quantity?: number;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  billingCountry?: string;
  shipping?: PrintShippingAddress;
  fulfillment?: PrintFulfillment;
  checkoutStartedAt?: string;
  paidAt?: string;
  refundedAt?: string;
}

export interface PrintShippingAddress {
  name?: string;
  email?: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  countryCode: "AU";
}

export interface PrintFulfillment {
  provider: "peecho" | "lulu";
  status:
    | "not_configured"
    | "ready_for_manual_review"
    | "submitted"
    | "failed"
    | "shipped"
    | "delivered";
  preparedAt?: string;
  submittedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  externalOrderId?: string;
  externalStatus?: string;
  trackingUrl?: string;
  carrier?: string;
  message?: string;
  payload?: unknown;
}

export type PrintOrderType = "owner_copy" | "public_purchase";

export type PrintOrderStatus =
  | "checkout_started"
  | "paid"
  | "fulfillment_pending"
  | "fulfillment_submitted"
  | "shipped"
  | "delivered"
  | "failed"
  | "refunded";

export interface PrintOrderRecord {
  id: string;
  type: PrintOrderType;
  projectId: string;
  storyId: string;
  ownerUserId: string;
  buyerUserId?: string;
  buyerEmail?: string;
  productKey: "hardcover";
  productLabel: string;
  provider: "lulu";
  format: string;
  status: PrintOrderStatus;
  amountAudCents: number;
  subtotalAudCents: number;
  shippingAudCents: number;
  luluCostAudCents?: number;
  marginAudCents?: number;
  pageCount: number;
  quantity: number;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  billingCountry?: string;
  shipping?: PrintShippingAddress;
  fulfillment?: PrintFulfillment;
  checkoutStartedAt?: string;
  paidAt?: string;
  refundedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookProject {
  id: string;
  userId: string;
  sourceStoryId: string;
  profileId: string;
  ageBand: AgeBand;
  status: BookProjectStatus;
  trimSize: string;
  pageCount: number;
  spreadCount: number;
  completedSpreads: number;
  totalSpreads: number;
  currentStageLabel: string;
  characterBible?: CharacterBible;
  locationBible?: LocationBible;
  beats: Beat[];
  spreads: BookSpread[];
  assets: BookAsset;
  billing?: BookBilling;
  printOrder?: PrintBookOrder;
  errorCode?: string;
  errorMessage?: string;
  rawError?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  readyAt?: string;
}

export interface BookBuildJob {
  id: string;
  projectId: string;
  userId: string;
  mode: BookBuildMode;
  status: BookBuildJobStatus;
  step: number;
  totalSteps?: number;
  token: string;
  baseUrl: string;
  currentStepLabel?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
