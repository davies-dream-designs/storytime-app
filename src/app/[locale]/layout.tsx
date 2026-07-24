import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { getClerkLocalization } from "@/i18n/clerk";
import { isLocale } from "@/i18n/locales";
import { GlobalPendingProvider } from "@/components/GlobalPending";
import { storycotTheme } from "@/lib/theme";
import "../globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://storycot.com"),
  title: "Storycot — AI Bedtime Stories for Kids",
  description:
    "Create magical, personalised bedtime stories for your children with AI. Feature their favourite toys, animals, and adventures. Save and print as a beautiful storybook.",
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/icon.png",
  },
  openGraph: {
    title: "Storycot — AI Bedtime Stories for Kids",
    description:
      "Create magical, personalised bedtime stories for your children with AI.",
    url: "https://storycot.com",
    siteName: "Storycot",
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "Storycot" },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Storycot — AI Bedtime Stories for Kids",
    description:
      "Create magical, personalised bedtime stories for your children with AI.",
    images: ["/og-image.png"],
  },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  const messages = await getMessages();
  const clerkLocalization = getClerkLocalization(locale);

  return (
    <ClerkProvider
      localization={clerkLocalization}
      appearance={{
        variables: storycotTheme.clerk,
      }}
    >
      <NextIntlClientProvider locale={locale} messages={messages}>
        <html
          lang={locale}
          className={`${fredoka.variable} ${nunito.variable}`}
        >
          <body className="bg-parchment text-ink font-body antialiased">
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-xl focus:bg-night-800 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-moon-200 focus:outline-none focus:ring-2 focus:ring-moon-400"
            >
              Skip to main content
            </a>
            <GlobalPendingProvider>{children}</GlobalPendingProvider>
          </body>
        </html>
      </NextIntlClientProvider>
    </ClerkProvider>
  );
}
