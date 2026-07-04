import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/waitlist/route";

function post(body: unknown) {
  return new Request("http://localhost/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/waitlist", () => {
  it("accepts a valid email", async () => {
    const res = await POST(post({ email: "parent@example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects an invalid email", async () => {
    const res = await POST(post({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });

  it("rejects a malformed body", async () => {
    const res = await POST(post("{ not json"));
    expect(res.status).toBe(400);
  });
});
