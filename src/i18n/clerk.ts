import { deDE, enUS, esES, frFR, itIT, ptBR, zhCN } from "@clerk/localizations";
import type { Locale } from "@/i18n/locales";

const clerkLocalizations = {
  en: enUS,
  es: esES,
  fr: frFR,
  zh: zhCN,
  de: deDE,
  it: itIT,
  pt: ptBR,
} satisfies Record<Locale, typeof enUS>;

export function getClerkLocalization(locale: Locale) {
  return clerkLocalizations[locale];
}
