// Localized chrome for the printed/exported book: the fixed title-page,
// copyright-page and closing-page wording that surrounds the story prose.
// These are the only non-story strings baked into the PDF, so they live here
// (the PDF builders are plain functions with no next-intl request context).

export type PdfChromeLabels = {
  forName: (name: string) => string;
  createdForName: (name: string) => string;
  tagline: string;
  taglineLong: string;
  copyright: (year: number) => string;
  createdOn: (date: string) => string;
  backCoverBlurb: string;
  bedtimeFooter: string;
  createYourOwn: string;
  dateLocale: string;
};

type LabelSet = {
  for: string;
  createdFor: string;
  tagline: string;
  taglineLong: string;
  copyrightHolder: string;
  createdOnPrefix: string;
  backCoverBlurb: string;
  bedtimeFooter: string;
  createYourOwn: string;
  dateLocale: string;
};

const LABELS: Record<string, LabelSet> = {
  en: { for: "For", createdFor: "Created for", tagline: "Personalised bedtime stories", taglineLong: "Personalised bedtime stories made for home reading", copyrightHolder: "Storycot", createdOnPrefix: "Created on", backCoverBlurb: "A personalised story from Storycot", bedtimeFooter: "Personalised for bedtime reading", createYourOwn: "Create your own at storycot.com.au", dateLocale: "en-GB" },
  es: { for: "Para", createdFor: "Creado para", tagline: "Cuentos personalizados para dormir", taglineLong: "Cuentos personalizados para leer en casa", copyrightHolder: "Storycot", createdOnPrefix: "Creado el", backCoverBlurb: "Un cuento personalizado de Storycot", bedtimeFooter: "Personalizado para leer antes de dormir", createYourOwn: "Crea el tuyo en storycot.com.au", dateLocale: "es-ES" },
  fr: { for: "Pour", createdFor: "Créé pour", tagline: "Histoires du soir personnalisées", taglineLong: "Histoires du soir personnalisées à lire à la maison", copyrightHolder: "Storycot", createdOnPrefix: "Créé le", backCoverBlurb: "Une histoire personnalisée de Storycot", bedtimeFooter: "Personnalisé pour la lecture du soir", createYourOwn: "Créez la vôtre sur storycot.com.au", dateLocale: "fr-FR" },
  de: { for: "Für", createdFor: "Erstellt für", tagline: "Personalisierte Gutenachtgeschichten", taglineLong: "Personalisierte Gutenachtgeschichten zum Vorlesen zu Hause", copyrightHolder: "Storycot", createdOnPrefix: "Erstellt am", backCoverBlurb: "Eine personalisierte Geschichte von Storycot", bedtimeFooter: "Personalisiert zum Vorlesen am Abend", createYourOwn: "Erstelle deine eigene auf storycot.com.au", dateLocale: "de-DE" },
  it: { for: "Per", createdFor: "Creato per", tagline: "Storie della buonanotte personalizzate", taglineLong: "Storie della buonanotte personalizzate da leggere a casa", copyrightHolder: "Storycot", createdOnPrefix: "Creato il", backCoverBlurb: "Una storia personalizzata di Storycot", bedtimeFooter: "Personalizzata per la lettura della buonanotte", createYourOwn: "Crea la tua su storycot.com.au", dateLocale: "it-IT" },
  pt: { for: "Para", createdFor: "Criado para", tagline: "Histórias de embalar personalizadas", taglineLong: "Histórias de embalar personalizadas para ler em casa", copyrightHolder: "Storycot", createdOnPrefix: "Criado em", backCoverBlurb: "Uma história personalizada da Storycot", bedtimeFooter: "Personalizada para ler ao deitar", createYourOwn: "Crie a sua em storycot.com.au", dateLocale: "pt-PT" },
  nl: { for: "Voor", createdFor: "Gemaakt voor", tagline: "Persoonlijke voorleesverhaaltjes", taglineLong: "Persoonlijke voorleesverhaaltjes om thuis te lezen", copyrightHolder: "Storycot", createdOnPrefix: "Gemaakt op", backCoverBlurb: "Een persoonlijk verhaal van Storycot", bedtimeFooter: "Persoonlijk gemaakt om voor te lezen", createYourOwn: "Maak je eigen verhaal op storycot.com.au", dateLocale: "nl-NL" },
  pl: { for: "Dla", createdFor: "Stworzone dla", tagline: "Spersonalizowane bajki na dobranoc", taglineLong: "Spersonalizowane bajki na dobranoc do czytania w domu", copyrightHolder: "Storycot", createdOnPrefix: "Utworzono", backCoverBlurb: "Spersonalizowana opowieść od Storycot", bedtimeFooter: "Spersonalizowana do czytania na dobranoc", createYourOwn: "Stwórz własną na storycot.com.au", dateLocale: "pl-PL" },
  tr: { for: "Kime", createdFor: "Şunun için hazırlandı:", tagline: "Kişiye özel uyku masalları", taglineLong: "Evde okumak için kişiye özel uyku masalları", copyrightHolder: "Storycot", createdOnPrefix: "Oluşturulma tarihi", backCoverBlurb: "Storycot'tan kişiye özel bir masal", bedtimeFooter: "Uyku vakti okuması için kişiye özel", createYourOwn: "Kendininkini storycot.com.au'da oluştur", dateLocale: "tr-TR" },
  id: { for: "Untuk", createdFor: "Dibuat untuk", tagline: "Cerita pengantar tidur yang dipersonalisasi", taglineLong: "Cerita pengantar tidur yang dipersonalisasi untuk dibaca di rumah", copyrightHolder: "Storycot", createdOnPrefix: "Dibuat pada", backCoverBlurb: "Cerita yang dipersonalisasi dari Storycot", bedtimeFooter: "Dipersonalisasi untuk dibaca menjelang tidur", createYourOwn: "Buat milikmu di storycot.com.au", dateLocale: "id-ID" },
  ru: { for: "Для", createdFor: "Создано для", tagline: "Персональные сказки на ночь", taglineLong: "Персональные сказки на ночь для чтения дома", copyrightHolder: "Storycot", createdOnPrefix: "Создано", backCoverBlurb: "Персональная история от Storycot", bedtimeFooter: "Создано для чтения на ночь", createYourOwn: "Создайте свою на storycot.com.au", dateLocale: "ru-RU" },
  ja: { for: "おくりもの：", createdFor: "この本は次の子のために作られました：", tagline: "パーソナライズされたおやすみ絵本", taglineLong: "おうちで読むためのパーソナライズされたおやすみ絵本", copyrightHolder: "Storycot", createdOnPrefix: "作成日", backCoverBlurb: "Storycotのパーソナライズ絵本", bedtimeFooter: "おやすみ前の読み聞かせ用にパーソナライズ", createYourOwn: "storycot.com.au であなただけの一冊を", dateLocale: "ja-JP" },
  zh: { for: "送给", createdFor: "为其创作：", tagline: "个性化睡前故事", taglineLong: "为家庭阅读打造的个性化睡前故事", copyrightHolder: "Storycot", createdOnPrefix: "创作于", backCoverBlurb: "来自 Storycot 的个性化故事", bedtimeFooter: "为睡前阅读量身打造", createYourOwn: "在 storycot.com.au 创作属于你的故事", dateLocale: "zh-CN" },
};

export function getPdfChromeLabels(locale: string | undefined): PdfChromeLabels {
  const base = LABELS[(locale ?? "en").split("-")[0]!] ?? LABELS.en!;
  return {
    forName: (name) => `${base.for} ${name}`,
    createdForName: (name) => `${base.createdFor} ${name}`,
    tagline: base.tagline,
    taglineLong: base.taglineLong,
    copyright: (year) => `Copyright © ${year} ${base.copyrightHolder}`,
    createdOn: (date) => `${base.createdOnPrefix} ${date}`,
    backCoverBlurb: base.backCoverBlurb,
    bedtimeFooter: base.bedtimeFooter,
    createYourOwn: base.createYourOwn,
    dateLocale: base.dateLocale,
  };
}
