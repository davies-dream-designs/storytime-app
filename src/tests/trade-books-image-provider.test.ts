import { afterEach, describe, expect, it } from "vitest";
import { getBookImageProvider } from "@/lib/trade-books/imageProvider";
import { TRADE_SYSTEM_USER_ID } from "@/types/tradeBook";

const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
});

function configureTradeImages() {
  delete process.env.TRADE_BOOKS_TEXT_MODEL;
  delete process.env.TRADE_BOOKS_REVIEW_MODEL;
  delete process.env.TRADE_BOOKS_TRENDS_MODEL;
  delete process.env.TRADE_BOOKS_IMAGE_FALLBACK_MODEL;
  process.env.TRADE_BOOKS_OPENAI_BASE_URL = "https://cliproxy.test/v1/";
  process.env.TRADE_BOOKS_OPENAI_API_KEY = "trade-key";
  process.env.TRADE_BOOKS_IMAGE_MODEL = "openai/trade-image";
}

describe("getBookImageProvider", () => {
  it("resolves a trade marker only through Cliproxy configuration", () => {
    configureTradeImages();
    process.env.OPENAI_API_KEY = "consumer-key";

    expect(
      getBookImageProvider({
        userId: TRADE_SYSTEM_USER_ID,
        assets: { imageProvider: "trade_cliproxy", proofVersion: 1 },
      })
    ).toMatchObject({
      baseUrl: "https://cliproxy.test/v1",
      apiKey: "trade-key",
      models: ["trade-image"],
      isTrade: true,
    });
  });

  it("keeps consumer builds on their existing OpenAI configuration", () => {
    process.env.OPENAI_API_KEY = "consumer-key";
    process.env.OPENAI_API_BASE_URL = "https://consumer.test/v1/";
    process.env.OPENAI_IMAGE_MODEL = "consumer-image";

    expect(
      getBookImageProvider({ userId: "user-1", assets: { proofVersion: 1 } })
    ).toEqual({
      baseUrl: "https://consumer.test/v1",
      apiKey: "consumer-key",
      models: ["consumer-image"],
      isTrade: false,
    });
  });
});
