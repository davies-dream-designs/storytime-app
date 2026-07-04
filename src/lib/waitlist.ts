import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const LOOPS_API = "https://app.loops.so/api/v1";

// Local fallback for dev / when Loops isn't configured. A serverless FS is
// ephemeral, so this is only for the smoke-test phase.
const STORE_PATH =
  process.env.WAITLIST_FILE ?? join(process.cwd(), ".data", "waitlist.jsonl");

type Result = { ok: true } | { ok: false; status: number; error: string };

const FAILURE: Result = {
  ok: false,
  status: 502,
  error: "We couldn't save your email just now — please try again.",
};

export async function addToWaitlist(email: string, source: string): Promise<Result> {
  if (process.env.LOOPS_API_KEY) {
    try {
      const payload: {
        email: string;
        source: string;
        userGroup: string;
        mailingLists?: Record<string, boolean>;
      } = { email, source, userGroup: "waitlist" };

      if (process.env.LOOPS_MAILING_LIST_ID) {
        payload.mailingLists = { [process.env.LOOPS_MAILING_LIST_ID]: true };
      }

      // /contacts/update upserts: creates the contact or updates if it exists,
      // so repeat signups don't error.
      const res = await fetch(`${LOOPS_API}/contacts/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data: { success?: boolean } = await res.json();
        if (data.success) return { ok: true };
      }
      return FAILURE;
    } catch {
      return FAILURE;
    }
  }

  // No Loops configured: append locally (dev smoke test).
  const record = JSON.stringify({ email, source, at: new Date().toISOString() });
  try {
    await mkdir(dirname(STORE_PATH), { recursive: true });
    await appendFile(STORE_PATH, record + "\n", "utf8");
  } catch {
    // Best-effort during the smoke-test phase.
  }
  return { ok: true };
}
