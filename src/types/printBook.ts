export type AgeBand = "0-2" | "3-5" | "6-8";

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
  "front_matter" | "text_art" | "hero" | "quiet" | "end_matter";

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
  imageUrl?: string;
  leftPageImageUrl?: string;
  leftPageWebImageUrl?: string;
  rightPageImageUrl?: string;
  leftPageImageError?: string;
  rightPageImageError?: string;
  thumbnailUrl?: string;
  leftPageVideoUrl?: string;
}

export type AnimatedVideoStatus = "generating" | "ready" | "failed";

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
  animatedVideoUnlockedAt?: string;
  animatedVideoCheckoutSessionId?: string;
  animatedVideoStatus?: AnimatedVideoStatus;
  animatedVideoStartedAt?: string;
  animatedVideoReadyAt?: string;
  animatedVideoError?: string;
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
  productKey: "softcover" | "hardcover" | "layflat";
  productLabel: string;
  provider: string;
  format: string;
  status: "checkout_started" | "paid" | "refunded";
  amountAud: number;
  pageCount: number;
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
  status: "not_configured" | "ready_for_manual_review" | "submitted" | "failed";
  preparedAt?: string;
  submittedAt?: string;
  externalOrderId?: string;
  externalStatus?: string;
  message?: string;
  payload?: unknown;
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
