import type { TradeBooksModelConfig } from "@/types/tradeBook";

export class TradeBooksModelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeBooksModelConfigurationError";
  }
}

function requiredValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new TradeBooksModelConfigurationError(`${name} is not configured`);
  }
  return value;
}

function requiredUrl(name: string): string {
  const value = requiredValue(name);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TradeBooksModelConfigurationError(`${name} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TradeBooksModelConfigurationError(
      `${name} must use http or https`
    );
  }
  return url.toString().replace(/\/$/, "");
}

export function getTradeBooksModelConfig(): TradeBooksModelConfig {
  return {
    baseUrl: requiredUrl("TRADE_BOOKS_OPENAI_BASE_URL"),
    apiKey: requiredValue("TRADE_BOOKS_OPENAI_API_KEY"),
    textModel: requiredValue("TRADE_BOOKS_TEXT_MODEL"),
    reviewModel: requiredValue("TRADE_BOOKS_REVIEW_MODEL"),
    trendsModel: requiredValue("TRADE_BOOKS_TRENDS_MODEL"),
    imageModel: requiredValue("TRADE_BOOKS_IMAGE_MODEL"),
    imageFallbackModel: requiredValue("TRADE_BOOKS_IMAGE_FALLBACK_MODEL"),
  };
}
