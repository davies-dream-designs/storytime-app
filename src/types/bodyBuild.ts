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
