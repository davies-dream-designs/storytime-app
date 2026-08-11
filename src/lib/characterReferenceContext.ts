import type { ChildProfile, StoryPerson } from "@/types";
import {
  buildChildAppearanceSummary,
  formatAge,
  getBodyBuildIllustrationCue,
  getBodyBuildLabel,
  getStoryPersonAgeGroupIllustrationCue,
  getStoryPersonAgeGroupLabel,
  getStoryPersonHeightIllustrationCue,
  getStoryPersonHeightLabel,
  getStoryPersonRelationshipLabel,
} from "@/types";

function normalizeHashInput(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function getChildProfileReferenceTraitText(
  profile: ChildProfile
): string {
  return [
    `age:${formatAge(profile)}`,
    `gender:${profile.gender ?? "not_specified"}`,
    `appearance:${buildChildAppearanceSummary(profile.appearance)}`,
  ]
    .map(normalizeHashInput)
    .join("|");
}

export function getStoryPersonReferenceTraitText(person: StoryPerson): string {
  return [
    `relationship:${getStoryPersonRelationshipLabel(person)}`,
    `pronouns:${person.pronouns ?? ""}`,
    `age:${person.ageGroup ?? "not_specified"}`,
    `height:${person.height ?? "not_specified"}`,
    `body:${person.bodyBuild ?? "not_specified"}`,
    `appearance:${person.appearance}`,
  ]
    .map(normalizeHashInput)
    .join("|");
}

export function getChildProfileReferenceTraitHash(
  profile: ChildProfile
): string {
  return stableHash(getChildProfileReferenceTraitText(profile));
}

export function getStoryPersonReferenceTraitHash(person: StoryPerson): string {
  return stableHash(getStoryPersonReferenceTraitText(person));
}

export function isChildProfileReferenceStale(profile: ChildProfile): boolean {
  if (!profile.avatarImageUrl) return false;
  if (!profile.avatarTraitHash) return true;
  return profile.avatarTraitHash !== getChildProfileReferenceTraitHash(profile);
}

export function isStoryPersonReferenceStale(person: StoryPerson): boolean {
  if (!person.avatarImageUrl) return false;
  if (!person.avatarTraitHash) return true;
  return person.avatarTraitHash !== getStoryPersonReferenceTraitHash(person);
}

export function buildChildCanonicalAppearanceContext(
  profile: ChildProfile
): string {
  const structuredAppearance = buildChildAppearanceSummary(profile.appearance);
  return [
    structuredAppearance
      ? `Latest child profile appearance: ${structuredAppearance}.`
      : "",
    profile.appearanceSummary
      ? `Previous generated child reference summary, use only when it does not conflict with the latest profile appearance: ${profile.appearanceSummary}.`
      : "",
    isChildProfileReferenceStale(profile)
      ? "The illustrated child reference may be out of date; use it for face identity only and follow latest child profile appearance for changeable traits."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildStoryPersonCanonicalAppearanceContext(
  person: StoryPerson
): string {
  const bodyBuildCue = getBodyBuildIllustrationCue(person.bodyBuild);
  const ageGroupCue = getStoryPersonAgeGroupIllustrationCue(person.ageGroup);
  const heightCue = getStoryPersonHeightIllustrationCue(person.height);
  return [
    person.appearance.trim()
      ? `Latest edited appearance: ${person.appearance.trim()}.`
      : "",
    person.ageGroup && person.ageGroup !== "not_specified"
      ? `Latest age group: ${getStoryPersonAgeGroupLabel(person.ageGroup)}.`
      : "",
    ageGroupCue ? `Illustration age cue: ${ageGroupCue}.` : "",
    person.height && person.height !== "not_specified"
      ? `Latest height: ${getStoryPersonHeightLabel(person.height)}.`
      : "",
    heightCue ? `Illustration height cue: ${heightCue}.` : "",
    person.bodyBuild && person.bodyBuild !== "not_specified"
      ? `Latest body build: ${getBodyBuildLabel(person.bodyBuild)}.`
      : "",
    bodyBuildCue ? `Illustration body-build cue: ${bodyBuildCue}.` : "",
    person.appearanceSummary?.trim()
      ? `Previous generated reference summary, use only when it does not conflict with latest edited appearance, age, height, or body build: ${person.appearanceSummary.trim()}.`
      : "",
    isStoryPersonReferenceStale(person)
      ? "The illustrated reference may be out of date; use it for face identity only and follow latest edited appearance, age, height, and body build for changeable traits."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
