import type { ChildProfile, StoryPreset } from "@/types";
import { getAge } from "@/types";
import type { AgeBand } from "@/types/printBook";

export function inferAgeBand(profile: ChildProfile): AgeBand {
  const age = getAge(profile);

  if (age <= 2) return "0-2";
  if (age <= 5) return "3-5";
  return "6-8";
}

export function inferBookAgeBand(input: {
  profile: ChildProfile;
  storyPreset?: StoryPreset;
}): AgeBand {
  switch (input.storyPreset) {
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
