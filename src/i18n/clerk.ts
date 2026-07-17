import { deDE, enUS, esES, frFR, zhCN } from "@clerk/localizations";
import type { Locale } from "@/i18n/locales";

const clerkLocalizations = {
  en: enUS,
  es: esES,
  fr: frFR,
  zh: zhCN,
  de: deDE,
} satisfies Record<Locale, typeof enUS>;

export function getClerkLocalization(locale: Locale) {
  return clerkLocalizations[locale];
}
