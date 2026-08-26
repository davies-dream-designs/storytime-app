import type { ChildAppearance } from "./profileAppearance";
import { getBodyBuildLabel, type BodyBuild } from "./bodyBuild";
import {
  getStoryPersonAgeGroupLabel,
  getStoryPersonHeightLabel,
  type StoryPersonAgeGroup,
  type StoryPersonHeight,
} from "./storyPersonTraits";

export const CHILD_GENDERS = [
  "girl",
  "boy",
  "non_binary",
  "not_specified",
] as const;

export type ChildGender = (typeof CHILD_GENDERS)[number];

export function sanitizeChildGender(value: unknown): ChildGender {
  return CHILD_GENDERS.includes(value as ChildGender)
    ? (value as ChildGender)
    : "not_specified";
}

export interface ChildProfile {
  id: string;
  userId: string;
  name: string;
  age: number; // kept for backward compat; prefer computing from dateOfBirth
  dateOfBirth?: string; // YYYY-MM-DD
  gender?: ChildGender;
  appearance?: ChildAppearance;
  avatarImageUrl?: string;
  appearanceSummary?: string;
  avatarTraitHash?: string;
  avatarGeneratedAt?: string;
  favouriteCharacters: string[];
  favouriteActivities: string[];
  favouriteAnimals: string[];
  favouritePlaces: string[];
  lessons: string[];
  createdAt: string;
}

export function getAge(profile: ChildProfile): number {
  if (profile.dateOfBirth) {
    const dob = new Date(profile.dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    return m < 0 || (m === 0 && today.getDate() < dob.getDate())
      ? age - 1
      : age;
  }
  return profile.age ?? 0;
}

export function getAgeInMonths(profile: ChildProfile): number {
  if (profile.dateOfBirth) {
    const dob = new Date(profile.dateOfBirth);
    const today = new Date();
    return Math.max(
      0,
      (today.getFullYear() - dob.getFullYear()) * 12 +
        (today.getMonth() - dob.getMonth()) -
        (today.getDate() < dob.getDate() ? 1 : 0)
    );
  }

  return Math.max(0, Math.round((profile.age ?? 0) * 12));
}

export function formatAge(profile: ChildProfile): string {
  if (profile.dateOfBirth) {
    const dob = new Date(profile.dateOfBirth);
    const today = new Date();
    const totalMonths =
      (today.getFullYear() - dob.getFullYear()) * 12 +
      (today.getMonth() - dob.getMonth()) -
      (today.getDate() < dob.getDate() ? 1 : 0);
    if (totalMonths < 12) {
      return totalMonths <= 1
        ? `${totalMonths} month`
        : `${totalMonths} months`;
    }
    const years = Math.floor(totalMonths / 12);
    return years === 1 ? "1 year" : `${years} years`;
  }
  const age = profile.age ?? 0;
  return age === 1 ? "1 year" : `${age} years`;
}

export function isBirthday(profile: ChildProfile): boolean {
  if (!profile.dateOfBirth) return false;
  const dob = new Date(profile.dateOfBirth);
  const today = new Date();
  return (
    dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate()
  );
}

export interface StoryPage {
  pageNumber: number;
  text: string;
  illustrationPrompt: string;
}

export interface StorySuggestion {
  title: string;
  premise: string;
  theme: string;
}

export type StoryPreset =
  | "baby-drift"
  | "little-listener"
  | "toddler-tale"
  | "first-adventure"
  | "preschool-story"
  | "big-kid-chapter"
  | "young-reader-short"
  | "young-reader-classic"
  | "young-reader-long"
  | "tiny-tales"
  | "moonlit-adventures"
  | "epic-sagas";

export interface StoryIpPolicy {
  riskLevel: "clear" | "originalized" | "restricted";
  printAllowed: boolean;
  reasons: string[];
  matchedTerms?: string[];
  originalizedPremise?: string;
  originalizedNotes?: string;
}

export type StoryVisibility = "private" | "share_link" | "public";

export type PublicReviewStatus =
  "not_submitted" | "pending_review" | "approved" | "rejected";

export const STORY_PRESETS = [
  "baby-drift",
  "little-listener",
  "toddler-tale",
  "first-adventure",
  "preschool-story",
  "big-kid-chapter",
  "young-reader-short",
  "young-reader-classic",
  "young-reader-long",
] as const;

export function getDefaultPreset(
  ageYears: number,
  ageMonths = ageYears * 12
): StoryPreset {
  if (ageMonths < 12) return "baby-drift";
  if (ageMonths < 24) return "little-listener";
  if (ageMonths < 36) return "toddler-tale";
  if (ageMonths < 48) return "first-adventure";
  if (ageYears <= 5) return "preschool-story";
  if (ageYears <= 8) return "big-kid-chapter";
  return "young-reader-classic";
}

export interface Story {
  id: string;
  userId: string;
  title: string;
  profileId: string;
  profileName: string;
  pages: StoryPage[];
  wordCount: number;
  theme: string;
  premise?: string;
  notes: string;
  locationHint?: string;
  locationFixtureId?: string;
  locationFixtureIds?: string[];
  storyPreset?: StoryPreset;
  storyPersonIds?: string[];
  ipPolicy?: StoryIpPolicy;
  createdAt: string;
  status?: "generating" | "ready" | "failed";
  generationError?: string;
  /** Id of the durable Inngest job that owns this story's generation. */
  generationJobId?: string;
  /** When a generator last claimed this story; used to detect stale claims. */
  generationClaimedAt?: string;
  /** Set once the story-credit has been deducted, so retries never re-charge. */
  creditChargedAt?: string;
  shareToken?: string;
  visibility?: StoryVisibility;
  publicReviewStatus?: PublicReviewStatus;
  publicSubmittedAt?: string;
  publicReviewedAt?: string;
  publicReviewedBy?: string;
  publicRejectionReason?: string;
  publicAuthorName?: string;
  publicTermsAcceptedAt?: string;
}

export interface Character {
  id: string;
  userId: string;
  name: string;
  description: string;
  personality: string;
  appearance: string;
  profileId: string;
  createdAt: string;
}

export const STORY_PERSON_RELATIONSHIPS = [
  "mum",
  "dad",
  "parent",
  "grandparent",
  "great_grandparent",
  "auntie",
  "uncle",
  "cousin",
  "sibling",
  "friend",
  "carer",
  "babysitter",
  "neighbour",
  "teacher",
  "pet",
  "other",
] as const;

export type StoryPersonRelationship =
  (typeof STORY_PERSON_RELATIONSHIPS)[number];

export interface StoryPerson {
  id: string;
  userId: string;
  name: string;
  relationship: StoryPersonRelationship;
  customRelationship?: string;
  bodyBuild?: BodyBuild;
  ageGroup?: StoryPersonAgeGroup;
  height?: StoryPersonHeight;
  description: string;
  personality: string;
  appearance: string;
  pronouns?: string;
  avatarImageUrl?: string;
  appearanceSummary?: string;
  avatarTraitHash?: string;
  avatarGeneratedAt?: string;
  availableToAllProfiles: boolean;
  profileIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function sanitizeStoryPersonRelationship(
  value: unknown
): StoryPersonRelationship {
  return STORY_PERSON_RELATIONSHIPS.includes(value as StoryPersonRelationship)
    ? (value as StoryPersonRelationship)
    : "other";
}

export function getStoryPersonRelationshipLabel(
  person: Pick<StoryPerson, "relationship" | "customRelationship">
): string {
  const custom = person.customRelationship?.trim();
  if (person.relationship === "other" && custom) return custom;
  return person.relationship
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function getStoryPersonAppearanceContext(person: StoryPerson): string {
  const parts = [
    person.appearance.trim(),
    person.ageGroup && person.ageGroup !== "not_specified"
      ? `Age group: ${getStoryPersonAgeGroupLabel(person.ageGroup)}.`
      : "",
    person.height && person.height !== "not_specified"
      ? `Height: ${getStoryPersonHeightLabel(person.height)}.`
      : "",
    person.bodyBuild && person.bodyBuild !== "not_specified"
      ? `Body build: ${getBodyBuildLabel(person.bodyBuild)}.`
      : "",
    person.appearanceSummary?.trim()
      ? `Previous generated reference summary, use only when it does not conflict with the latest appearance, age, height, or body build: ${person.appearanceSummary.trim()}`
      : "",
  ].filter(Boolean);
  return Array.from(new Set(parts)).join(" ");
}

export const LESSON_OPTIONS = [
  "kindness",
  "bravery",
  "sharing",
  "trying new things",
  "dealing with emotions",
  "friendship",
  "patience",
  "honesty",
  "gratitude",
  "perseverance",
  "confidence",
  "calm bedtime",
  "listening",
  "gentle routines",
  "problem solving",
  "curiosity",
  "being helpful",
  "self belief",
] as const;

export type Lesson = (typeof LESSON_OPTIONS)[number];

export * from "./bodyBuild";
export * from "./profileAppearance";
export * from "./storyPersonTraits";
