import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";

// Story generation: 10 stories per user per hour.
// Protects Anthropic API spend from abuse.
export const storyRatelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, "1 h"),
  prefix: "rl:story",
  analytics: false,
});

// Image regeneration: 20 per user per hour.
// More generous than story since retries are common after failed builds.
export const imageRatelimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(20, "1 h"),
  prefix: "rl:image",
  analytics: false,
});

/**
 * Check a rate limit and return a 429 Response if exceeded, otherwise null.
 * Pass the user id as the identifier so limits are per-account.
 */
export async function checkRatelimit(
  limiter: Ratelimit,
  userId: string
): Promise<Response | null> {
  try {
    const { success, limit, remaining, reset } = await limiter.limit(userId);
    if (!success) {
      const retryAfterSec = Math.ceil((reset - Date.now()) / 1000);
      return new Response(
        JSON.stringify({
          error: "Too many requests. Please wait a moment and try again.",
          retryAfter: retryAfterSec,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(remaining),
            "Retry-After": String(retryAfterSec),
          },
        }
      );
    }
  } catch {
    // If KV is unavailable, fail open — don't block the user.
  }
  return null;
}
