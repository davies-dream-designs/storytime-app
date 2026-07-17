export type DateRangePreset = "all" | "7d" | "30d" | "90d" | "custom";

export type DateRangeValue = {
  preset: DateRangePreset;
  from: string;
  to: string;
};

export const defaultDateRange: DateRangeValue = {
  preset: "all",
  from: "",
  to: "",
};

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfLocalDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  );
}

function parseLocalDateInput(value: string, endOfDay = false) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return endOfDay ? endOfLocalDay(date) : startOfLocalDay(date);
}

export function getLocalDateRangeBounds(
  range: DateRangeValue,
  now = new Date()
) {
  if (range.preset === "all") return {};

  if (range.preset === "custom") {
    return {
      start: parseLocalDateInput(range.from),
      end: parseLocalDateInput(range.to, true),
    };
  }

  const days = range.preset === "7d" ? 7 : range.preset === "30d" ? 30 : 90;
  const end = endOfLocalDay(now);
  const start = startOfLocalDay(now);
  start.setDate(start.getDate() - (days - 1));
  return { start, end };
}

export function isIsoDateInLocalRange(
  isoDate: string,
  range: DateRangeValue,
  now = new Date()
) {
  const value = new Date(isoDate).getTime();
  if (Number.isNaN(value)) return false;

  const { start, end } = getLocalDateRangeBounds(range, now);
  if (start && value < start.getTime()) return false;
  if (end && value > end.getTime()) return false;
  return true;
}

export function formatLocalShortDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
