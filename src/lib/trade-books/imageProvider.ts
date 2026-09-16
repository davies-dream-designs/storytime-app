import { getTradeBooksImageConfig } from "@/lib/trade-books/modelConfig";
import type { BookProject } from "@/types/printBook";
import { TRADE_SYSTEM_USER_ID } from "@/types/tradeBook";

export type BookImageProvider = {
  baseUrl: string;
  apiKey: string;
  models: string[];
  isTrade: boolean;
};

export function isTradeBookProject(
  project: Pick<BookProject, "userId" | "assets">
): boolean {
  return (
    project.userId === TRADE_SYSTEM_USER_ID ||
    project.assets.imageProvider === "trade_cliproxy"
  );
}

export function getBookImageProvider(
  project: Pick<BookProject, "userId" | "assets">
): BookImageProvider {
  if (isTradeBookProject(project)) {
    const config = getTradeBooksImageConfig();
    return {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      models: [config.imageModel, config.imageFallbackModel].filter(
        (model): model is string => Boolean(model)
      ),
      isTrade: true,
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const configuredModel = process.env.OPENAI_IMAGE_MODEL?.trim();
  return {
    baseUrl: (
      process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    apiKey,
    models: configuredModel
      ? [configuredModel]
      : ["gpt-image-2", "gpt-image-1"],
    isTrade: false,
  };
}
