export type StoryGameTile = 0 | 1 | 2;

export interface StoryGameNpc {
  id: string;
  name: string;
  x: number;
  y: number;
  color: number;
  dialogue: string[];
  roamRadius?: number;
}

export interface StoryGameItem {
  id: string;
  name: string;
  x: number;
  y: number;
  onCollect: string;
}

export interface StoryGameJson {
  title: string;
  world: {
    name: string;
    map: StoryGameTile[][];
    style?: {
      biome: string;
      groundColor: number;
      skyColor: number;
      fogColor: number;
      wallColor: number;
      trunkColor: number;
      foliageColors: number[];
      itemColor: number;
      itemGlowColor: number;
      itemShape: "star" | "crystal" | "pearl" | "charm";
    };
  };
  player: {
    name: string;
    startX: number;
    startY: number;
  };
  npcs: StoryGameNpc[];
  items: StoryGameItem[];
  quest: {
    objective: string;
    steps?: Array<
      | {
          type: "collect";
          objective: string;
          itemId: string;
          onComplete?: string;
        }
      | {
          type: "talk";
          objective: string;
          npcId: string;
          dialogue: string[];
        }
    >;
    completeTrigger: {
      type: "collect";
      itemId: string;
    };
    completeNpcId: string;
    returnObjective: string;
    completeTitle: string;
    completeMessage: string;
    completeDialogue: string[];
  };
}

export const STORY_GAME_TILE = {
  grass: 0,
  wall: 1,
  tree: 2,
} as const satisfies Record<string, StoryGameTile>;
