import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBlobDelete } = vi.hoisted(() => ({
  mockBlobDelete: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  put: vi.fn(),
  del: mockBlobDelete,
}));

describe("storeBookAsset", () => {
  beforeEach(() => {
    vi.resetModules();
    mockBlobDelete.mockReset();
    delete process.env.VERCEL_ENV;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.PREVIEW_READ_WRITE_TOKEN;
    delete process.env.PREVIEW_STORE_ID;
    delete process.env.PROD_READ_WRITE_TOKEN;
    delete process.env.PROD_STORE_ID;
  });

  it("falls back to a data URL when blob storage is not configured", async () => {
    const { storeBookAsset } = await import("@/lib/print-books/storage");
    const url = await storeBookAsset({
      pathname: "books/book-1/cover.svg",
      body: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      contentType: "image/svg+xml",
    });

    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });

  it("treats preview-scoped blob credentials as configured storage", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.PREVIEW_READ_WRITE_TOKEN = "vercel_blob_rw_token";

    const { isBookAssetStorageConfigured } =
      await import("@/lib/print-books/storage");

    expect(isBookAssetStorageConfigured()).toBe(true);
  });

  it("collects and deletes blob-backed book assets", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_token";
    const {
      collectBookAssetUrls,
      collectBookDownloadableAssetUrls,
      deleteBookProjectAssets,
    } = await import("@/lib/print-books/storage");
    const blob = (pathname: string) =>
      `https://store.blob.vercel-storage.com/${pathname}`;
    const project = {
      id: "book-1",
      assets: {
        proofVersion: 0,
        coverImageUrl: blob("books/book-1/cover.png"),
        printPdfUrl: blob("books/book-1/print.pdf"),
        luluCoverPdfUrl: blob("books/book-1/lulu-cover.pdf"),
        luluPrintPdfUrl: blob("books/book-1/lulu-print.pdf"),
        epubUrl: blob("books/book-1/storycot.epub"),
        previewImages: [
          blob("books/book-1/previews/1.png"),
          blob("books/book-1/cover.png"),
          "data:image/png;base64,abc",
        ],
      },
      spreads: [
        {
          imageUrl: blob("books/book-1/spreads/1.png"),
          leftPageImageUrl: blob("books/book-1/spreads/2-left.png"),
          rightPageImageUrl: "https://example.com/not-our-blob.png",
          thumbnailUrl: blob("books/book-1/spreads/2-thumb.png"),
        },
      ],
    };

    const urls = collectBookAssetUrls(project as never);
    expect(urls).toEqual([
      blob("books/book-1/cover.png"),
      blob("books/book-1/lulu-cover.pdf"),
      blob("books/book-1/print.pdf"),
      blob("books/book-1/lulu-print.pdf"),
      blob("books/book-1/storycot.epub"),
      blob("books/book-1/previews/1.png"),
      blob("books/book-1/spreads/1.png"),
      blob("books/book-1/spreads/2-left.png"),
      blob("books/book-1/spreads/2-thumb.png"),
    ]);
    expect(collectBookDownloadableAssetUrls(project as never)).toEqual([
      blob("books/book-1/lulu-cover.pdf"),
      blob("books/book-1/print.pdf"),
      blob("books/book-1/lulu-print.pdf"),
      blob("books/book-1/storycot.epub"),
      blob("books/book-1/previews/1.png"),
    ]);

    await expect(deleteBookProjectAssets(project as never)).resolves.toBe(9);
    expect(mockBlobDelete).toHaveBeenCalledWith(urls, {
      token: "vercel_blob_rw_token",
    });
  });
});
