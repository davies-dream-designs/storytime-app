import type { Metadata } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";

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
  title: "Brushbeasts — Show your teeth, brush like a beast",
  description:
    "Brushbeasts are collectible monster mouth-props that make brushing fun for little kids. Join the waitlist and be first to back us on Kickstarter.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Brushbeasts — Show your teeth, brush like a beast",
    description:
      "Collectible monster mouth-props that turn the nightly brushing battle into a game kids beg for.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body className="bg-cream text-ink font-body antialiased">{children}</body>
    </html>
  );
}
