import { afterEach, describe, expect, it } from "vitest";
import {
  getTradeBooksModelConfig,
  TradeBooksModelConfigurationError,
} from "@/lib/trade-books/modelConfig";

const TRADE_ENV_NAMES = [
  "TRADE_BOOKS_OPENAI_BASE_URL",
  "TRADE_BOOKS_OPENAI_API_KEY",
  "TRADE_BOOKS_TEXT_MODEL",
  "TRADE_BOOKS_REVIEW_MODEL",
  "TRADE_BOOKS_TRENDS_MODEL",
  "TRADE_BOOKS_IMAGE_MODEL",
  "TRADE_BOOKS_IMAGE_FALLBACK_MODEL",
] as const;

const originalEnvironment = Object.fromEntries(
  TRADE_ENV_NAMES.map((name) => [name, process.env[name]])
);

afterEach(() => {
  for (const name of TRADE_ENV_NAMES) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function configureTradeModels() {
  process.env.TRADE_BOOKS_OPENAI_BASE_URL = "http://127.0.0.1:8317/v1";
  process.env.TRADE_BOOKS_OPENAI_API_KEY = "test-key";
  process.env.TRADE_BOOKS_TEXT_MODEL = "openai/claude-sonnet-5";
  process.env.TRADE_BOOKS_REVIEW_MODEL = "openai/claude-opus-5";
  process.env.TRADE_BOOKS_TRENDS_MODEL = "openai/claude-haiku-4-5-20251001";
  process.env.TRADE_BOOKS_IMAGE_MODEL = "gpt-image-2";
  process.env.TRADE_BOOKS_IMAGE_FALLBACK_MODEL = "gpt-image-1.5";
}

describe("trade books model config", () => {
  it("uses explicit trade-only model settings", () => {
    configureTradeModels();

    expect(getTradeBooksModelConfig()).toEqual({
      baseUrl: "http://127.0.0.1:8317/v1",
      apiKey: "test-key",
      textModel: "openai/claude-sonnet-5",
      reviewModel: "openai/claude-opus-5",
      trendsModel: "openai/claude-haiku-4-5-20251001",
      imageModel: "gpt-image-2",
      imageFallbackModel: "gpt-image-1.5",
    });
  });

  it("fails closed when a trade-only setting is missing", () => {
    configureTradeModels();
    delete process.env.TRADE_BOOKS_TEXT_MODEL;

    expect(() => getTradeBooksModelConfig()).toThrow(
      new TradeBooksModelConfigurationError(
        "TRADE_BOOKS_TEXT_MODEL is not configured"
      )
    );
  });

  it("rejects a non-http trade endpoint", () => {
    configureTradeModels();
    process.env.TRADE_BOOKS_OPENAI_BASE_URL = "file:///tmp/cliproxy";

    expect(() => getTradeBooksModelConfig()).toThrow(
      new TradeBooksModelConfigurationError(
        "TRADE_BOOKS_OPENAI_BASE_URL must use http or https"
      )
    );
  });
});
