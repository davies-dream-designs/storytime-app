import { storycotTheme } from "@/lib/theme";

export function getStoryTheme(theme: string) {
  return (
    storycotTheme.stories[
      theme.toLowerCase() as keyof typeof storycotTheme.stories
    ] ?? storycotTheme.defaultStory
  );
}

export function getStoryThemeName(
  theme: string,
  themeNames: Record<string, string>
) {
  const themeConfig = getStoryTheme(theme);

  return "tKey" in themeConfig
    ? (themeNames[themeConfig.tKey] ?? theme)
    : theme;
}
