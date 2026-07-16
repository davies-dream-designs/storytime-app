import { describe, expect, it } from "vitest";
import {
  defaultDateRange,
  getLocalDateRangeBounds,
  isIsoDateInLocalRange,
} from "@/lib/dates";

describe("local date ranges", () => {
  it("keeps all dates for the all-time preset", () => {
    expect(
      isIsoDateInLocalRange("2026-01-01T00:00:00.000Z", defaultDateRange)
    ).toBe(true);
  });

  it("uses local calendar-day bounds for rolling ranges", () => {
    const now = new Date(2026, 6, 16, 15, 30);
    const bounds = getLocalDateRangeBounds(
      { preset: "7d", from: "", to: "" },
      now
    );

    expect(bounds.start?.getFullYear()).toBe(2026);
    expect(bounds.start?.getMonth()).toBe(6);
    expect(bounds.start?.getDate()).toBe(10);
    expect(bounds.start?.getHours()).toBe(0);
    expect(bounds.end?.getDate()).toBe(16);
    expect(bounds.end?.getHours()).toBe(23);
  });

  it("filters custom ranges using local date inputs", () => {
    const range = {
      preset: "custom" as const,
      from: "2026-07-15",
      to: "2026-07-16",
    };

    expect(isIsoDateInLocalRange("2026-07-15T00:00:00.000Z", range)).toBe(true);
    expect(isIsoDateInLocalRange("2026-07-16T23:59:00.000Z", range)).toBe(true);
    expect(isIsoDateInLocalRange("2026-07-17T00:00:00.000Z", range)).toBe(
      false
    );
  });
});
