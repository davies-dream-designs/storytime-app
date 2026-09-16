import type {
  ChildGender,
  StoryIpPolicy,
  StoryPersonRelationship,
} from "@/types";
import type { StoryPreset } from "@/types";

export const TRADE_SYSTEM_USER_ID = "trade-system";

export type TradeTitleStatus =
  | "queued"
  | "generating"
  | "draft"
  | "approved"
  | "rejected"
  | "published"
  | "failed";

export interface TradeTitleSeedBrief {
  theme: string;
  premise: string;
  notes: string;
  storyPreset: StoryPreset;
  locale: string;
  protagonist: {
    name: string;
    age: number;
    gender?: ChildGender;
  };
  cast?: Array<{
    relationship: StoryPersonRelationship;
    description: string;
    personality: string;
    appearance: string;
  }>;
}

export type TradeTitleSafetyResult =
  { ok: true } | { ok: false; reason: string; category: string };

export interface TradeTitleModelMetadata {
  provider: "cliproxy-openai-compatible";
  textModel: string;
  reviewModel: string;
  promptVersion: string;
  generatedAt: string;
}

export interface TradeTitleGateResults {
  inputSafety: TradeTitleSafetyResult;
  inputIp: StoryIpPolicy;
  profileIp: StoryIpPolicy;
  outputSafety?: TradeTitleSafetyResult;
  outputIp?: StoryIpPolicy;
}

export interface TradeTitle {
  id: string;
  status: TradeTitleStatus;
  seedBrief: TradeTitleSeedBrief;
  profileId?: string;
  storyId?: string;
  bookProjectId?: string;
  modelMetadata?: TradeTitleModelMetadata;
  gateResults?: TradeTitleGateResults;
  generationError?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  publishedAt?: string;
  storeUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type TradeBookJobKind = "generate_title" | "build_book";

export type TradeBookJobStatus =
  "queued" | "running" | "retry_scheduled" | "completed" | "failed";

export interface TradeBookJob {
  id: string;
  kind: TradeBookJobKind;
  dedupeKey: string;
  payload: Record<string, unknown>;
  status: TradeBookJobStatus;
  attempts: number;
  availableAt: string;
  leaseToken?: string;
  leaseExpiresAt?: string;
  lastError?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TradeBooksModelConfig {
  baseUrl: string;
  apiKey: string;
  textModel: string;
  reviewModel: string;
  trendsModel: string;
  imageModel: string;
  imageFallbackModel: string;
}
