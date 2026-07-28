import { NextRequest } from "next/server";
import { isLocale, type Locale } from "@/i18n/locales";
import type { PrintShippingAddress } from "@/types/printBook";

export function getRequestOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");

  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {}
  }

  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}

export function getRequestLocale(req: NextRequest): Locale | undefined {
  const referer = req.headers.get("referer");
  if (!referer) return undefined;

  try {
    const pathname = new URL(referer).pathname;
    const locale = pathname.split("/").filter(Boolean)[0];
    return isLocale(locale) ? locale : undefined;
  } catch {
    return undefined;
  }
}

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function cleanEmail(value: unknown) {
  return cleanText(value, 254).toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function parsePrintShippingAddress(
  value: unknown
): PrintShippingAddress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const line1 = cleanText(input.line1, 120);
  const line2 = cleanText(input.line2, 120);
  const city = cleanText(input.city, 80);
  const state = cleanText(input.state, 40).toUpperCase();
  const postalCode = cleanText(input.postalCode, 12);
  const countryCode = cleanText(input.countryCode, 2).toUpperCase();
  const name = cleanText(input.name, 120);
  const email = cleanEmail(input.email);
  const phone = cleanText(input.phone, 40);

  if (
    !line1 ||
    !city ||
    !postalCode ||
    countryCode !== "AU" ||
    (email && !isValidEmail(email))
  ) {
    return undefined;
  }

  return {
    name: name || undefined,
    email: email || undefined,
    phone: phone || undefined,
    line1,
    line2: line2 || undefined,
    city,
    state: state || undefined,
    postalCode,
    countryCode: "AU",
  };
}
