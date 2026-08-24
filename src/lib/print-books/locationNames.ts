/**
 * Pure location-name helpers. Kept free of server-only dependencies so both
 * server code (locationBible) and client code (LocationDetailsModal) can import
 * it without pulling the Anthropic SDK into the browser bundle.
 */
export function composeLocationName(place: string, area?: string): string {
  const cleanPlace = place.trim();
  const cleanArea = (area ?? "").trim();
  if (cleanPlace && cleanArea) return `${cleanPlace} (${cleanArea})`;
  return cleanPlace || cleanArea || "Location";
}
