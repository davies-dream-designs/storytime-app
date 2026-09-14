export type PublicStoryRewardTier = {
  place: 1 | 2 | 3;
  label: string;
  credits: number;
  emoji: string;
};

export const PUBLIC_STORY_REWARD_TIERS: PublicStoryRewardTier[] = [
  { place: 1, label: "1st place", credits: 10, emoji: "🥇" },
  { place: 2, label: "2nd place", credits: 5,  emoji: "🥈" },
  { place: 3, label: "3rd place", credits: 3,  emoji: "🥉" },
];
