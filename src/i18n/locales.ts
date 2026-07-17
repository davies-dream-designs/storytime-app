export const localeConfigs = [
  {
    code: "en",
    label: "English",
    shortLabel: "EN",
    stripeLocale: "en",
    dateLocale: "en-AU",
  },
  {
    code: "es",
    label: "Español",
    shortLabel: "ES",
    stripeLocale: "es",
    dateLocale: "es-ES",
  },
  {
    code: "fr",
    label: "Français",
    shortLabel: "FR",
    stripeLocale: "fr",
    dateLocale: "fr-FR",
  },
  {
    code: "zh",
    label: "中文",
    shortLabel: "中文",
    stripeLocale: "zh",
    dateLocale: "zh-CN",
  },
  {
    code: "de",
    label: "Deutsch",
    shortLabel: "DE",
    stripeLocale: "de",
    dateLocale: "de-DE",
  },
  {
    code: "it",
    label: "Italiano",
    shortLabel: "IT",
    stripeLocale: "it",
    dateLocale: "it-IT",
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

export function getStripeLocale(locale: string | undefined) {
  return getLocaleConfig(locale)?.stripeLocale ?? "auto";
}

export function getDateLocale(locale: string | undefined) {
  return getLocaleConfig(locale)?.dateLocale ?? "en-AU";
}
