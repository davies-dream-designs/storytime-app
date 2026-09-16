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

// Cliproxy uses bare model IDs; strip any "openai/" prefix so config values
// like "openai/claude-sonnet-5" and "claude-sonnet-5" both work.
function stripProviderPrefix(model: string): string {
  return model.replace(/^[^/]+\//, "");
}

export type TradeBooksImageConfig = Pick<
  TradeBooksModelConfig,
  "baseUrl" | "apiKey" | "imageModel"
> & {
  imageFallbackModel?: string;
};

export function getTradeBooksImageConfig(): TradeBooksImageConfig {
  const imageFallbackModel =
    process.env.TRADE_BOOKS_IMAGE_FALLBACK_MODEL?.trim();
  return {
    baseUrl: requiredUrl("TRADE_BOOKS_OPENAI_BASE_URL"),
    apiKey: requiredValue("TRADE_BOOKS_OPENAI_API_KEY"),
    imageModel: stripProviderPrefix(requiredValue("TRADE_BOOKS_IMAGE_MODEL")),
    imageFallbackModel: imageFallbackModel
      ? stripProviderPrefix(imageFallbackModel)
      : undefined,
  };
}

export function getTradeBooksModelConfig(): TradeBooksModelConfig {
  const imageConfig = getTradeBooksImageConfig();
  if (!imageConfig.imageFallbackModel) {
    throw new TradeBooksModelConfigurationError(
      "TRADE_BOOKS_IMAGE_FALLBACK_MODEL is not configured"
    );
  }
  return {
    ...imageConfig,
    imageFallbackModel: imageConfig.imageFallbackModel,
    textModel: stripProviderPrefix(requiredValue("TRADE_BOOKS_TEXT_MODEL")),
    reviewModel: stripProviderPrefix(requiredValue("TRADE_BOOKS_REVIEW_MODEL")),
    trendsModel: stripProviderPrefix(requiredValue("TRADE_BOOKS_TRENDS_MODEL")),
  };
}
