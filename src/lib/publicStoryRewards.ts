import type { StoryPreset } from "@/types";

export type PublicStoryRewardCategory = {
  key: "all" | StoryPreset;
  label: string;
  credits: number;
};

export const PUBLIC_STORY_REWARD_CATEGORIES: PublicStoryRewardCategory[] = [
  { key: "all", label: "Overall winner", credits: 8 },
  { key: "tiny-tales", label: "Little listeners", credits: 3 },
  { key: "moonlit-adventures", label: "Bedtime adventures", credits: 3 },
  { key: "epic-sagas", label: "Older readers", credits: 3 },
];
