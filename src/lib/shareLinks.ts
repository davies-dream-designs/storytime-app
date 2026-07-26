const STORYCOT_ORIGIN = "https://storycot.com";

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function buildSharedStoryUrl({
  origin,
  locale,
  token,
}: {
  origin: string;
  locale: string;
  token: string;
}) {
  return `${normalizeOrigin(origin)}/${encodeURIComponent(locale)}/s/${encodeURIComponent(token)}`;
}

export function buildReferralUrl(userId: string, origin = STORYCOT_ORIGIN) {
  const url = new URL(normalizeOrigin(origin));
  url.searchParams.set("ref", userId);
  return url.toString();
}

export function buildFacebookShareUrl(url: string) {
  const shareUrl = new URL("https://www.facebook.com/sharer/sharer.php");
  shareUrl.searchParams.set("u", url);
  return shareUrl.toString();
}
