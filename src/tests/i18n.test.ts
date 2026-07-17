import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { localeConfigs } from "@/i18n/locales";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}

function readMessages(locale: string) {
  return JSON.parse(
    readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8")
  ) as unknown;
}

describe("i18n messages", () => {
  it("keeps every locale aligned with the English message keys", () => {
    const englishKeys = flattenKeys(readMessages("en")).sort();

    for (const { code } of localeConfigs) {
      const localeKeys = flattenKeys(readMessages(code)).sort();

      expect(localeKeys, `${code}.json keys`).toEqual(englishKeys);
    }
  });
});
