import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { locales } from "./i18n/locales";

const handleI18n = createIntlMiddleware(routing);
const localePattern = locales.join("|");

function isAuHost(hostname: string) {
  return hostname === "storycot.com.au" || hostname === "www.storycot.com.au";
}

const isPublicRoute = createRouteMatcher([
  // Locale-prefixed routes
  `/(${localePattern})`,
  `/(${localePattern})/sign-in(.*)`,
  `/(${localePattern})/sign-up(.*)`,
  `/(${localePattern})/support(.*)`,
  `/(${localePattern})/privacy(.*)`,
  `/(${localePattern})/terms(.*)`,
  `/(${localePattern})/s/(.*)`,
  `/(${localePattern})/gift/(.*)`,
  // Non-prefixed sign-in/up - Clerk may redirect here; intl will then redirect to /en/
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/stripe/webhook",
]);

export default clerkMiddleware(
  async (auth, req) => {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.next();
    }

    const intlResponse = handleI18n(req);

    // Return locale redirects immediately - don't auth-check paths being redirected
    // (e.g. /sign-in → /en/sign-in must not hit auth.protect first)
    if (
      intlResponse &&
      intlResponse.status >= 300 &&
      intlResponse.status < 400
    ) {
      return intlResponse;
    }

    if (!isPublicRoute(req)) {
      await auth.protect();
    }

    return intlResponse ?? NextResponse.next();
  },
  (req) => {
    const proxyClerk = isAuHost(req.nextUrl.hostname);

    return {
      proxyUrl: proxyClerk ? `${req.nextUrl.origin}/__clerk` : undefined,
      frontendApiProxy: {
        enabled: proxyClerk,
        path: "/__clerk",
      },
    };
  }
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
