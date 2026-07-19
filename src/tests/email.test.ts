import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSend = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: {
      send: mockSend,
    },
  })),
}));

describe("sendBookReadyEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "test-key";
  });

  it("uses current Storycot branding in book-ready email outreach", async () => {
    const { sendBookReadyEmail } = await import("@/lib/email");

    await sendBookReadyEmail({
      toEmail: "parent@example.com",
      toName: "Bailey",
      storyTitle: "Firefly Forest Walk",
      bookId: "book-1",
      appUrl: "https://dev.storycot.com/en",
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Storycot <noreply@storycot.com>",
        subject: "Your Storycot book is ready — Firefly Forest Walk",
      })
    );
    const message = mockSend.mock.calls[0]?.[0];
    expect(message.html).toContain(
      'src="https://storycot.com/nav-icon-light.png"'
    );
    expect(message.html).not.toContain("dev.storycot.com/nav-icon-light.png");
    expect(message.html).not.toContain("/en/nav-icon-light.png");
    expect(message.html).toContain("https://dev.storycot.com/en/books/book-1");
    expect(message.html).toContain("Storycot");
    expect(message.html).toContain("#2d2058");
    expect(message.html).not.toContain("🌙 Storycot");
    expect(message.subject).not.toContain("✨");
  });

  it("escapes user-controlled email fields", async () => {
    const { sendBookReadyEmail } = await import("@/lib/email");

    await sendBookReadyEmail({
      toEmail: "parent@example.com",
      toName: "<Bailey>",
      storyTitle: "Firefly & Friends",
      bookId: "book-1",
      appUrl: "https://dev.storycot.com/en",
    });

    const message = mockSend.mock.calls[0]?.[0];
    expect(message.html).toContain("Hi &lt;Bailey&gt;");
    expect(message.html).toContain("Firefly &amp; Friends");
  });
});
