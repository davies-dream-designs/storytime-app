export const PROFILE_IP_CONFIRMATION_ERROR =
  "Please confirm the child profile does not include branded characters, franchise names, copyrighted toys, logos, or protected story worlds.";

export function hasProfileIpConfirmation(body: unknown) {
  if (!body || typeof body !== "object") return false;
  return (
    (body as { ipConfirmationAccepted?: unknown }).ipConfirmationAccepted ===
    true
  );
}
