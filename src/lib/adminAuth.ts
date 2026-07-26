import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";

export interface AdminIdentity {
  userId: string;
  /** Best label for attributing admin actions (email if present). */
  label: string;
}

/**
 * Resolve the current admin, or `null` if the caller isn't a signed-in admin.
 * Centralises the `privateMetadata.isAdmin === true` gate used across admin routes.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin !== true) return null;

  return {
    userId,
    label: user.primaryEmailAddress?.emailAddress ?? userId,
  };
}
