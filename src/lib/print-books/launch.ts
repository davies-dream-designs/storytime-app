export function isPrintOrderingGloballyEnabled() {
  return process.env.PRINT_BOOK_ORDERING_ENABLED === "true";
}

export function isPublicPrintOrderingEnabled() {
  return process.env.NEXT_PUBLIC_PRINT_BOOK_ORDERING_ENABLED === "true";
}

export function canStartPrintCheckout(isAdmin: boolean) {
  if (isPrintOrderingGloballyEnabled()) return true;
  if (process.env.VERCEL_ENV !== "production") return true;
  return isAdmin;
}

export const PRINT_ORDERING_COMING_SOON_MESSAGE =
  "Printed books are coming soon. You can still create and download your PDF or EPUB today.";
