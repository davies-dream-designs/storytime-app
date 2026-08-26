/**
 * Shared type and lightweight helpers for avatar generation job responses.
 * This module is client-safe (no server-only imports).
 */

export type AvatarGenerationEnqueueResult = {
  jobId: string;
  status: "queued" | "running";
  attemptKey: string;
  existing: boolean;
};

export function isActiveAvatarStatus(status?: string): boolean {
  return status === "queued" || status === "running";
}

export function isAvatarJobResponse(
  value: unknown
): value is AvatarGenerationEnqueueResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "jobId" in value &&
    "status" in value &&
    "attemptKey" in value
  );
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
