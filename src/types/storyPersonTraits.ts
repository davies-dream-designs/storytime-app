export const STORY_PERSON_AGE_GROUP_OPTIONS = [
  "not_specified",
  "baby",
  "toddler",
  "child",
  "teen",
  "young_adult",
  "adult",
  "older_adult",
] as const;

export type StoryPersonAgeGroup =
  (typeof STORY_PERSON_AGE_GROUP_OPTIONS)[number];

export const STORY_PERSON_HEIGHT_OPTIONS = [
  "not_specified",
  "very_short",
  "short",
  "average",
  "tall",
  "very_tall",
] as const;

export type StoryPersonHeight = (typeof STORY_PERSON_HEIGHT_OPTIONS)[number];

export function sanitizeStoryPersonAgeGroup(
  value: unknown
): StoryPersonAgeGroup {
  return STORY_PERSON_AGE_GROUP_OPTIONS.includes(value as StoryPersonAgeGroup)
    ? (value as StoryPersonAgeGroup)
    : "not_specified";
}

export function sanitizeStoryPersonHeight(value: unknown): StoryPersonHeight {
  return STORY_PERSON_HEIGHT_OPTIONS.includes(value as StoryPersonHeight)
    ? (value as StoryPersonHeight)
    : "not_specified";
}

export function getStoryPersonAgeGroupLabel(
  value?: StoryPersonAgeGroup
): string {
  switch (value) {
    case "baby":
      return "Baby";
    case "toddler":
      return "Toddler";
    case "child":
      return "Child";
    case "teen":
      return "Teen";
    case "young_adult":
      return "Young Adult";
    case "adult":
      return "Adult";
    case "older_adult":
      return "Older Adult";
    case "not_specified":
    default:
      return "Prefer Not To Say";
  }
}

export function getStoryPersonHeightLabel(value?: StoryPersonHeight): string {
  switch (value) {
    case "very_short":
      return "Very Short";
    case "short":
      return "Short";
    case "average":
      return "Average Height";
    case "tall":
      return "Tall";
    case "very_tall":
      return "Very Tall";
    case "not_specified":
    default:
      return "Prefer Not To Say";
  }
}

export function getStoryPersonAgeGroupIllustrationCue(
  value?: StoryPersonAgeGroup
): string {
  switch (value) {
    case "baby":
      return "baby age group with infant proportions and soft baby facial features";
    case "toddler":
      return "toddler age group with toddler proportions and round young features";
    case "child":
      return "child age group with childlike proportions and youthful features";
    case "teen":
      return "teenage age group with adolescent proportions and youthful teen features";
    case "young_adult":
      return "young adult age group with young adult facial maturity";
    case "adult":
      return "adult age group with adult facial maturity";
    case "older_adult":
      return "older adult age group with mature adult features, without exaggerating frailty or age";
    case "not_specified":
    default:
      return "";
  }
}

export function getStoryPersonHeightIllustrationCue(
  value?: StoryPersonHeight
): string {
  switch (value) {
    case "very_short":
      return "very short relative height compared with other people in the scene";
    case "short":
      return "short relative height compared with other people in the scene";
    case "average":
      return "average relative height compared with other people in the scene";
    case "tall":
      return "tall relative height compared with other people in the scene";
    case "very_tall":
      return "very tall relative height compared with other people in the scene";
    case "not_specified":
    default:
      return "";
  }
}
