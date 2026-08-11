export const BODY_BUILD_OPTIONS = [
  "not_specified",
  "slim",
  "average",
  "broad",
  "large",
  "very_large",
] as const;

export type BodyBuild = (typeof BODY_BUILD_OPTIONS)[number];

export function sanitizeBodyBuild(value: unknown): BodyBuild {
  return BODY_BUILD_OPTIONS.includes(value as BodyBuild)
    ? (value as BodyBuild)
    : "not_specified";
}

export function getBodyBuildLabel(value?: BodyBuild): string {
  switch (value) {
    case "slim":
      return "Slim";
    case "average":
      return "Average";
    case "broad":
      return "Broad";
    case "large":
      return "Large";
    case "very_large":
      return "Very Large";
    case "not_specified":
    default:
      return "Prefer Not To Say";
  }
}

export function getBodyBuildIllustrationCue(value?: BodyBuild): string {
  switch (value) {
    case "slim":
      return "slim, narrow-framed body build";
    case "average":
      return "average, medium body build";
    case "broad":
      return "broad-shouldered, solid body build";
    case "large":
      return "large body build with a solid, gently fuller-than-average frame and natural facial softness, without exaggerated proportions";
    case "very_large":
      return "very large plus-size body build with a clearly fuller round frame, broad torso, rounder face, and visibly larger proportions than a large build";
    case "not_specified":
    default:
      return "";
  }
}
