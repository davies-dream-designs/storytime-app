import type { ChildProfile, StoryPreset } from "@/types";
import { getAge, getAgeInMonths } from "@/types";
import type { AgeBand } from "@/types/printBook";

export function inferAgeBand(profile: ChildProfile): AgeBand {
  const age = getAge(profile);
  const ageMonths = getAgeInMonths(profile);

  if (ageMonths < 12) return "baby-drift";
  if (ageMonths < 24) return "little-listener";
  if (ageMonths < 36) return "toddler-tale";
  if (ageMonths < 48) return "first-adventure";
  if (age <= 5) return "preschool-story";
  if (age <= 8) return "big-kid-chapter";
  return "young-reader-classic";
}

export function inferBookAgeBand(input: {
  profile: ChildProfile;
  storyPreset?: StoryPreset;
}): AgeBand {
  switch (input.storyPreset) {
    case "baby-drift":
      return "baby-drift";
    case "little-listener":
      return "little-listener";
    case "toddler-tale":
      return "toddler-tale";
    case "first-adventure":
      return "first-adventure";
    case "preschool-story":
      return "preschool-story";
    case "big-kid-chapter":
      return "big-kid-chapter";
    case "young-reader-short":
      return "young-reader-short";
    case "young-reader-classic":
      return "young-reader-classic";
    case "young-reader-long":
      return "young-reader-long";
    case "tiny-tales":
      return "0-2";
    case "moonlit-adventures":
      return "3-5";
    case "epic-sagas":
      return "6-8";
    default:
      return inferAgeBand(input.profile);
  }
}
