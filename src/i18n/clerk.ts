import {
  deDE,
  enUS,
  esES,
  frFR,
  idID,
  itIT,
  jaJP,
  nlNL,
  ptBR,
  ruRU,
  trTR,
  zhCN,
} from "@clerk/localizations";
import type { Locale } from "@/i18n/locales";

const clerkLocalizations = {
  en: enUS,
  es: esES,
  fr: frFR,
  zh: zhCN,
  de: deDE,
  it: itIT,
  pt: ptBR,
  nl: nlNL,
  ja: jaJP,
  ru: ruRU,
  id: idID,
  tr: trTR,
} satisfies Record<Locale, typeof enUS>;

export function getClerkLocalization(locale: Locale) {
  return clerkLocalizations[locale];
}
