import {
  pgTable,
  text,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ChildAppearance } from "@/types/profileAppearance";
import type {
  StoryPage,
  StoryIpPolicy,
  StoryPreset,
} from "@/types";
import type {
  AgeBand,
  Beat,
  BookSpread,
  BookAsset,
  BookBilling,
  PrintBookOrder,
  CharacterBible,
  BookProjectStatus,
  BookBuildMode,
  BookBuildJobStatus,
} from "@/types/printBook";

export const profiles = pgTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    age: integer("age").notNull().default(0),
    dateOfBirth: text("date_of_birth"),
    appearance: jsonb("appearance").$type<ChildAppearance>(),
    favouriteCharacters: text("favourite_characters").array().notNull().default([]),
    favouriteActivities: text("favourite_activities").array().notNull().default([]),
    favouriteAnimals: text("favourite_animals").array().notNull().default([]),
    favouritePlaces: text("favourite_places").array().notNull().default([]),
    lessons: text("lessons").array().notNull().default([]),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("profiles_user_id_idx").on(t.userId)]
);

export const stories = pgTable(
  "stories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    profileId: text("profile_id").notNull(),
    profileName: text("profile_name").notNull(),
    pages: jsonb("pages").$type<StoryPage[]>().notNull().default([]),
    wordCount: integer("word_count").notNull().default(0),
    theme: text("theme").notNull(),
    premise: text("premise"),
    notes: text("notes").notNull().default(""),
    storyPreset: text("story_preset").$type<StoryPreset>(),
    ipPolicy: jsonb("ip_policy").$type<StoryIpPolicy>(),
    createdAt: text("created_at").notNull(),
    status: text("status").$type<"generating" | "ready" | "failed">(),
    generationError: text("generation_error"),
    shareToken: text("share_token"),
  },
  (t) => [
    index("stories_user_id_idx").on(t.userId),
    index("stories_profile_id_idx").on(t.profileId),
    uniqueIndex("stories_share_token_idx").on(t.shareToken),
  ]
);

export const characters = pgTable(
  "characters",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    personality: text("personality").notNull(),
    appearance: text("appearance").notNull(),
    profileId: text("profile_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("characters_user_id_idx").on(t.userId),
    index("characters_profile_id_idx").on(t.profileId),
  ]
);

export const bookProjects = pgTable(
  "book_projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    sourceStoryId: text("source_story_id").notNull(),
    profileId: text("profile_id").notNull(),
    ageBand: text("age_band").$type<AgeBand>().notNull(),
    status: text("status").$type<BookProjectStatus>().notNull(),
    trimSize: text("trim_size").notNull(),
    pageCount: integer("page_count").notNull(),
    spreadCount: integer("spread_count").notNull(),
    completedSpreads: integer("completed_spreads").notNull().default(0),
    totalSpreads: integer("total_spreads").notNull(),
    currentStageLabel: text("current_stage_label").notNull(),
    characterBible: jsonb("character_bible").$type<CharacterBible>(),
    beats: jsonb("beats").$type<Beat[]>().notNull().default([]),
    spreads: jsonb("spreads").$type<BookSpread[]>().notNull().default([]),
    assets: jsonb("assets").$type<BookAsset>().notNull(),
    billing: jsonb("billing").$type<BookBilling>(),
    printOrder: jsonb("print_order").$type<PrintBookOrder>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    rawError: text("raw_error"),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    readyAt: text("ready_at"),
    // Separate column for atomic email-claim check; mirrored in assets.bookReadyEmailSentAt
    bookReadyEmailSentAt: text("book_ready_email_sent_at"),
  },
  (t) => [
    index("book_projects_user_id_idx").on(t.userId),
    index("book_projects_source_story_id_idx").on(t.sourceStoryId),
  ]
);

export const bookBuildJobs = pgTable(
  "book_build_jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    userId: text("user_id").notNull(),
    mode: text("mode").$type<BookBuildMode>().notNull(),
    status: text("status").$type<BookBuildJobStatus>().notNull(),
    step: integer("step").notNull().default(0),
    totalSteps: integer("total_steps"),
    token: text("token").notNull(),
    baseUrl: text("base_url").notNull(),
    currentStepLabel: text("current_step_label"),
    errorMessage: text("error_message"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("book_build_jobs_project_id_idx").on(t.projectId)]
);
