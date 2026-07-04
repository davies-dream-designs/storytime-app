import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const KIT_API = "https://api.kit.com/v4";

// Local fallback for dev / when Kit isn't configured. A serverless FS is
// ephemeral, so this is only for the smoke-test phase.
const STORE_PATH =
  process.env.WAITLIST_FILE ?? join(process.cwd(), ".data", "waitlist.jsonl");

type Result = { ok: true } | { ok: false; status: number; error: string };

const FAILURE: Result = {
  ok: false,
  status: 502,
  error: "We couldn't save your email just now — please try again.",
};

async function kit(path: string, body: unknown) {
  return fetch(`${KIT_API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Kit-Api-Key": process.env.KIT_API_KEY as string,
    },
    body: JSON.stringify(body),
  });
}

export async function addToWaitlist(email: string, source: string): Promise<Result> {
  if (process.env.KIT_API_KEY) {
    try {
      const res = await kit("/subscribers", { email_address: email });
      if (!res.ok) return FAILURE;

      // Optionally tag the subscriber so the waitlist is filterable in Kit.
      if (process.env.KIT_TAG_ID) {
        await kit(`/tags/${process.env.KIT_TAG_ID}/subscribers`, {
          email_address: email,
        }).catch(() => undefined);
      }
      return { ok: true };
    } catch {
      return FAILURE;
    }
  }

  // No Kit configured: append locally (dev smoke test).
  const record = JSON.stringify({ email, source, at: new Date().toISOString() });
  try {
    await mkdir(dirname(STORE_PATH), { recursive: true });
    await appendFile(STORE_PATH, record + "\n", "utf8");
  } catch {
    // Best-effort during the smoke-test phase.
  }
  return { ok: true };
}
