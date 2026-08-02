import type { StoryPreset } from "@/types";

export type PublicStoryRewardCategory = {
  key: "all" | StoryPreset;
  label: string;
  credits: number;
};

export const PUBLIC_STORY_REWARD_CATEGORIES: PublicStoryRewardCategory[] = [
  { key: "all", label: "Overall winner", credits: 8 },
  { key: "baby-drift", label: "Baby bedtime", credits: 3 },
  { key: "toddler-tale", label: "Toddler tales", credits: 3 },
  { key: "preschool-story", label: "Preschool stories", credits: 3 },
  { key: "big-kid-chapter", label: "Big kid chapters", credits: 3 },
  { key: "young-reader-classic", label: "Young readers", credits: 3 },
];
