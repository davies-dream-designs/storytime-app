import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { locales } from "./i18n/locales";

const handleI18n = createIntlMiddleware(routing);
const localePattern = locales.join("|");

const isPublicRoute = createRouteMatcher([
  // Locale-prefixed routes
  `/(${localePattern})`,
  `/(${localePattern})/sign-in(.*)`,
  `/(${localePattern})/sign-up(.*)`,
  `/(${localePattern})/support(.*)`,
  `/(${localePattern})/privacy(.*)`,
  `/(${localePattern})/terms(.*)`,
  `/(${localePattern})/public(.*)`,
  `/(${localePattern})/s/(.*)`,
  `/(${localePattern})/gift/(.*)`,
  // Non-prefixed sign-in/up - Clerk may redirect here; intl will then redirect to /en/
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/stripe/webhook",
]);

export default clerkMiddleware(async (auth, req) => {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/__clerk/")) {
    return NextResponse.next();
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  const intlResponse = handleI18n(req);

  return intlResponse ?? NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
