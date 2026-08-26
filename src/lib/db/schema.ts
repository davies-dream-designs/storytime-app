import {
  pgTable,
  text,
  integer,
  jsonb,
  index,
  uniqueIndex,
  boolean,
} from "drizzle-orm/pg-core";
import type { ChildAppearance } from "@/types/profileAppearance";
import type {
  ChildGender,
  BodyBuild,
  PublicReviewStatus,
  StoryPage,
  StoryIpPolicy,
  StoryPreset,
  StoryPersonAgeGroup,
  StoryPersonHeight,
  StoryPersonRelationship,
  StoryVisibility,
} from "@/types";
import type {
  AgeBand,
  Beat,
  BookSpread,
  BookAsset,
  BookBilling,
  PrintBookOrder,
  PrintOrderRecord,
  CharacterBible,
  LocationBible,
  BookProjectStatus,
  BookBuildMode,
  BookBuildJobStatus,
} from "@/types/printBook";
import type { GiftOrderStatus } from "@/types/gift";

export const profiles = pgTable(
  "profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    age: integer("age").notNull().default(0),
    dateOfBirth: text("date_of_birth"),
    gender: text("gender")
      .$type<ChildGender>()
      .notNull()
      .default("not_specified"),
    appearance: jsonb("appearance").$type<ChildAppearance>(),
    avatarImageUrl: text("avatar_image_url"),
    appearanceSummary: text("appearance_summary"),
    avatarTraitHash: text("avatar_trait_hash"),
    avatarGeneratedAt: text("avatar_generated_at"),
    favouriteCharacters: text("favourite_characters")
      .array()
      .notNull()
      .default([]),
    favouriteActivities: text("favourite_activities")
      .array()
      .notNull()
      .default([]),
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
    locationHint: text("location_hint"),
    locationFixtureId: text("location_fixture_id"),
    locationFixtureIds: text("location_fixture_ids")
      .array()
      .notNull()
      .default([]),
    storyPreset: text("story_preset").$type<StoryPreset>(),
    storyPersonIds: text("story_person_ids").array().notNull().default([]),
    ipPolicy: jsonb("ip_policy").$type<StoryIpPolicy>(),
    createdAt: text("created_at").notNull(),
    status: text("status").$type<"generating" | "ready" | "failed">(),
    generationError: text("generation_error"),
    generationJobId: text("generation_job_id"),
    generationClaimedAt: text("generation_claimed_at"),
    creditChargedAt: text("credit_charged_at"),
    shareToken: text("share_token"),
    visibility: text("visibility")
      .$type<StoryVisibility>()
      .notNull()
      .default("private"),
    publicReviewStatus: text("public_review_status")
      .$type<PublicReviewStatus>()
      .notNull()
      .default("not_submitted"),
    publicSubmittedAt: text("public_submitted_at"),
    publicReviewedAt: text("public_reviewed_at"),
    publicReviewedBy: text("public_reviewed_by"),
    publicRejectionReason: text("public_rejection_reason"),
    publicAuthorName: text("public_author_name"),
    publicTermsAcceptedAt: text("public_terms_accepted_at"),
  },
  (t) => [
    index("stories_user_id_idx").on(t.userId),
    index("stories_profile_id_idx").on(t.profileId),
    index("stories_public_review_status_idx").on(t.publicReviewStatus),
    index("stories_public_gallery_idx").on(t.visibility, t.publicReviewStatus),
    uniqueIndex("stories_share_token_idx").on(t.shareToken),
  ]
);

export const storyPeople = pgTable(
  "story_people",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    relationship: text("relationship")
      .$type<StoryPersonRelationship>()
      .notNull()
      .default("other"),
    customRelationship: text("custom_relationship"),
    bodyBuild: text("body_build").$type<BodyBuild>(),
    ageGroup: text("age_group").$type<StoryPersonAgeGroup>(),
    height: text("height").$type<StoryPersonHeight>(),
    description: text("description").notNull().default(""),
    personality: text("personality").notNull().default(""),
    appearance: text("appearance").notNull().default(""),
    pronouns: text("pronouns"),
    avatarImageUrl: text("avatar_image_url"),
    appearanceSummary: text("appearance_summary"),
    avatarTraitHash: text("avatar_trait_hash"),
    avatarGeneratedAt: text("avatar_generated_at"),
    availableToAllProfiles: boolean("available_to_all_profiles")
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("story_people_user_id_idx").on(t.userId)]
);

export const storyPersonProfiles = pgTable(
  "story_person_profiles",
  {
    storyPersonId: text("story_person_id").notNull(),
    profileId: text("profile_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("story_person_profiles_unique_idx").on(
      t.storyPersonId,
      t.profileId
    ),
    index("story_person_profiles_person_idx").on(t.storyPersonId),
    index("story_person_profiles_profile_idx").on(t.profileId),
    index("story_person_profiles_user_idx").on(t.userId),
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
    locationBible: jsonb("location_bible").$type<LocationBible>(),
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

export const errorEvents = pgTable(
  "error_events",
  {
    id: text("id").primaryKey(),
    createdAt: text("created_at").notNull(),
    // Classification (see src/lib/errors.ts)
    domain: text("domain").notNull(),
    code: text("code").notNull(),
    severity: text("severity").notNull(),
    // Who + what it relates to (for customer lookup / "someone called")
    userId: text("user_id"),
    userEmail: text("user_email"),
    entityType: text("entity_type"), // "story" | "book" | "print_order" | ...
    entityId: text("entity_id"),
    // Details
    message: text("message").notNull(), // developer-facing summary
    rawError: text("raw_error"), // stack / upstream body
    context: jsonb("context").$type<Record<string, unknown>>(),
    source: text("source"), // where it was logged (route/pipeline name)
    // Triage
    resolvedAt: text("resolved_at"),
    resolvedBy: text("resolved_by"),
    note: text("note"),
  },
  (t) => [
    index("error_events_created_at_idx").on(t.createdAt),
    index("error_events_domain_idx").on(t.domain),
    index("error_events_severity_idx").on(t.severity),
    index("error_events_user_id_idx").on(t.userId),
    index("error_events_entity_id_idx").on(t.entityId),
    index("error_events_resolved_at_idx").on(t.resolvedAt),
  ]
);

export const giftOrders = pgTable(
  "gift_orders",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    purchaserUserId: text("purchaser_user_id").notNull(),
    purchaserEmail: text("purchaser_email"),
    recipientEmail: text("recipient_email").notNull(),
    recipientName: text("recipient_name"),
    message: text("message"),
    packId: text("pack_id").notNull(),
    credits: integer("credits").notNull(),
    amountAud: integer("amount_aud_cents").notNull(),
    status: text("status").$type<GiftOrderStatus>().notNull(),
    checkoutSessionId: text("checkout_session_id"),
    paymentIntentId: text("payment_intent_id"),
    referralReferrerUserId: text("referral_referrer_user_id"),
    referralGrantedAt: text("referral_granted_at"),
    paidAt: text("paid_at"),
    redeemedByUserId: text("redeemed_by_user_id"),
    redeemedAt: text("redeemed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("gift_orders_token_idx").on(t.token),
    index("gift_orders_purchaser_user_id_idx").on(t.purchaserUserId),
    index("gift_orders_recipient_email_idx").on(t.recipientEmail),
    index("gift_orders_checkout_session_id_idx").on(t.checkoutSessionId),
    index("gift_orders_status_idx").on(t.status),
  ]
);

export const printOrders = pgTable(
  "print_orders",
  {
    id: text("id").primaryKey(),
    type: text("type").$type<PrintOrderRecord["type"]>().notNull(),
    projectId: text("project_id").notNull(),
    storyId: text("story_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    buyerUserId: text("buyer_user_id"),
    buyerEmail: text("buyer_email"),
    productKey: text("product_key")
      .$type<PrintOrderRecord["productKey"]>()
      .notNull(),
    productLabel: text("product_label").notNull(),
    provider: text("provider").$type<PrintOrderRecord["provider"]>().notNull(),
    format: text("format").notNull(),
    status: text("status").$type<PrintOrderRecord["status"]>().notNull(),
    amountAudCents: integer("amount_aud_cents").notNull(),
    subtotalAudCents: integer("subtotal_aud_cents").notNull(),
    shippingAudCents: integer("shipping_aud_cents").notNull(),
    luluCostAudCents: integer("lulu_cost_aud_cents"),
    marginAudCents: integer("margin_aud_cents"),
    pageCount: integer("page_count").notNull(),
    quantity: integer("quantity").notNull().default(1),
    checkoutSessionId: text("checkout_session_id"),
    paymentIntentId: text("payment_intent_id"),
    billingCountry: text("billing_country"),
    shipping: jsonb("shipping").$type<PrintOrderRecord["shipping"]>(),
    fulfillment: jsonb("fulfillment").$type<PrintOrderRecord["fulfillment"]>(),
    checkoutStartedAt: text("checkout_started_at"),
    paidAt: text("paid_at"),
    refundedAt: text("refunded_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("print_orders_project_id_idx").on(t.projectId),
    index("print_orders_story_id_idx").on(t.storyId),
    index("print_orders_owner_user_id_idx").on(t.ownerUserId),
    index("print_orders_buyer_user_id_idx").on(t.buyerUserId),
    uniqueIndex("print_orders_checkout_session_id_idx").on(t.checkoutSessionId),
    index("print_orders_status_idx").on(t.status),
    index("print_orders_created_at_idx").on(t.createdAt),
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

export const publicStoryVotes = pgTable(
  "public_story_votes",
  {
    id: text("id").primaryKey(),
    storyId: text("story_id").notNull(),
    userId: text("user_id").notNull(),
    voteMonth: text("vote_month").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("public_story_votes_story_user_month_idx").on(
      t.storyId,
      t.userId,
      t.voteMonth
    ),
    index("public_story_votes_story_month_idx").on(t.storyId, t.voteMonth),
    index("public_story_votes_user_month_idx").on(t.userId, t.voteMonth),
  ]
);

export const publicStoryReports = pgTable(
  "public_story_reports",
  {
    id: text("id").primaryKey(),
    storyId: text("story_id").notNull(),
    userId: text("user_id").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
    status: text("status")
      .$type<"open" | "reviewed" | "dismissed">()
      .notNull()
      .default("open"),
    createdAt: text("created_at").notNull(),
    reviewedAt: text("reviewed_at"),
    reviewedBy: text("reviewed_by"),
  },
  (t) => [
    uniqueIndex("public_story_reports_story_user_idx").on(t.storyId, t.userId),
    index("public_story_reports_story_status_idx").on(t.storyId, t.status),
    index("public_story_reports_status_idx").on(t.status),
  ]
);

export const locationFixtures = pgTable(
  "location_fixtures",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    place: text("place").notNull(),
    area: text("area"),
    summary: text("summary"),
    notes: text("notes"),
    referenceImageUrl: text("reference_image_url"),
    establishingImageUrl: text("establishing_image_url"),
    establishingImageStatus: text("establishing_image_status").$type<
      "queued" | "running" | "ready" | "failed"
    >(),
    establishingImageError: text("establishing_image_error"),
    establishingImageJobId: text("establishing_image_job_id"),
    fixedElements: jsonb("fixed_elements")
      .$type<string[]>()
      .notNull()
      .default([]),
    doNotChange: jsonb("do_not_change").$type<string[]>().notNull().default([]),
    lighting: text("lighting"),
    palette: text("palette"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("location_fixtures_user_id_idx").on(t.userId)]
);

export const processedWebhookEvents = pgTable(
  "processed_webhook_events",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("processed_webhook_events_source_idx").on(t.source)]
);

export const publicStoryModerationEvents = pgTable(
  "public_story_moderation_events",
  {
    id: text("id").primaryKey(),
    storyId: text("story_id").notNull(),
    actorUserId: text("actor_user_id"),
    actorLabel: text("actor_label").notNull(),
    action: text("action").notNull(),
    note: text("note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("public_story_moderation_events_story_idx").on(t.storyId),
    index("public_story_moderation_events_created_idx").on(t.createdAt),
    index("public_story_moderation_events_action_idx").on(t.action),
  ]
);
