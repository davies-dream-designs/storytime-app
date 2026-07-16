export type AgeBand = '0-2' | '3-5' | '6-8'

export type BookProjectStatus =
  | 'queued'
  | 'planning'
  | 'bible'
  | 'illustrating'
  | 'composing'
  | 'proofing'
  | 'ready'
  | 'failed'

export type BookBuildMode = 'full' | 'art' | 'exports' | 'finalize'

export type BookArtMode = 'placeholder' | 'generated' | 'mixed'

export type BookOrderabilityState = 'draft_only' | 'export_ready' | 'order_ready'

export interface ProofingCheck {
  key: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

export type BookSpreadLayoutType =
  | 'front_matter'
  | 'text_art'
  | 'hero'
  | 'quiet'
  | 'end_matter'

export type BeatPurpose =
  | 'setup'
  | 'invitation'
  | 'discovery'
  | 'challenge'
  | 'comfort'
  | 'resolution'
  | 'bedtime_close'

export type BeatMood = 'calm' | 'playful' | 'tense' | 'wonder' | 'sleepy'

export interface Beat {
  id: string
  sequence: number
  purpose: BeatPurpose
  summary: string
  textDraft: string
  visualIntent: string
  mood: BeatMood
  isQuietBeat: boolean
}

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

export interface BookAsset {
  coverImageUrl?: string
  coverPdfUrl?: string
  coverPdfReadyForOrdering?: boolean
  coverPdfSpineWidthIn?: number
  coverPdfSpineSource?: 'configured' | 'lulu_table'
  coverPdfPageWidthIn?: number
  coverPdfPageHeightIn?: number
  coverSpineTextIncluded?: boolean
  previewPdfUrl?: string
  previewPdfPageWidthIn?: number
  previewPdfPageHeightIn?: number
  printPdfUrl?: string
  printPdfPageWidthIn?: number
  printPdfPageHeightIn?: number
  interiorTextSafeMarginIn?: number
  previewImages?: string[]
  artMode?: BookArtMode
  exportVersion?: number
  finalExportVersion?: number
  lastBuildMode?: BookBuildMode
  artGenerationCursor?: number
  artGenerationTotal?: number
  orderabilityState?: BookOrderabilityState
  finalizedAt?: string
  exportProfile?: string
  proofingPassed?: boolean
  proofingChecks?: ProofingCheck[]
  proofingWarnings?: string[]
  proofingErrors?: string[]
  proofVersion: number
}

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
