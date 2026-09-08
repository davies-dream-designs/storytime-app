import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const put = vi.fn(async (pathname: string) => ({
  url: `https://blob.example/${pathname}-abc123`,
}));
const get = vi.fn();
const del = vi.fn(async () => undefined);
const list = vi.fn(async () => ({ blobs: [] }));

vi.mock("@vercel/blob", () => ({ put, get, del, list }));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...ORIGINAL_ENV, BLOB_READ_WRITE_TOKEN: "test-token" };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("storeTemporaryPrivateAsset — store access mode", () => {
  it("uses public access + random suffix on a public store (default)", async () => {
    delete process.env.BLOB_PRIVATE_ACCESS_ENABLED;
    const { storeTemporaryPrivateAsset } = await import(
      "@/lib/print-books/storage"
    );
    const result = await storeTemporaryPrivateAsset({
      pathname: "loc/room.png",
      body: Buffer.from("x"),
      contentType: "image/png",
    });
    expect(put).toHaveBeenCalledTimes(1);
    const opts = put.mock.calls[0][2] as {
      access: string;
      addRandomSuffix?: boolean;
    };
    expect(opts.access).toBe("public");
    expect(opts.addRandomSuffix).toBe(true);
    // Ref is the returned (unguessable) URL so read-back/delete work.
    expect(result.ref).toMatch(/^https:\/\/blob\.example\//);
    expect(result.isInline).toBe(false);
  });

  it("uses private access when BLOB_PRIVATE_ACCESS_ENABLED=true", async () => {
    process.env.BLOB_PRIVATE_ACCESS_ENABLED = "true";
    vi.resetModules();
    const { storeTemporaryPrivateAsset } = await import(
      "@/lib/print-books/storage"
    );
    const result = await storeTemporaryPrivateAsset({
      pathname: "loc/room.png",
      body: Buffer.from("x"),
      contentType: "image/png",
    });
    const opts = put.mock.calls[0][2] as { access: string };
    expect(opts.access).toBe("private");
    // Private blobs are referenced by pathname.
    expect(result.ref).toBe("loc/room.png");
  });
});
