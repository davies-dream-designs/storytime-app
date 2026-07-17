export const localeConfigs = [
  {
    code: "en",
    label: "English",
    shortLabel: "EN",
  },
  {
    code: "es",
    label: "Español",
    shortLabel: "ES",
  },
  {
    code: "fr",
    label: "Français",
    shortLabel: "FR",
  },
  {
    code: "zh",
    label: "中文",
    shortLabel: "中文",
  },
] as const;

export const locales = localeConfigs.map((locale) => locale.code);
export const defaultLocale = "en";

export type Locale = (typeof locales)[number];

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}

export function getLocaleConfig(locale: string | undefined) {
  return localeConfigs.find((config) => config.code === locale);
}
