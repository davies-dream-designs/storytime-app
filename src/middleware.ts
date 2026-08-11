import { clerkMiddleware } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const handleI18n = createIntlMiddleware(routing);

export default clerkMiddleware(async (_auth, req) => {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith("/__clerk/")) {
    return NextResponse.next();
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
