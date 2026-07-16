"use client";

import type { DateRangeValue } from "@/lib/dates";

type SelectOption = {
  value: string;
  label: string;
};

type DateRangeLabels = {
  all: string;
  last7: string;
  last30: string;
  last90: string;
  custom: string;
  from: string;
  to: string;
};

type CollectionFiltersProps = {
  search: string;
  searchPlaceholder: string;
  onSearchChange: (value: string) => void;
  dateRange: DateRangeValue;
  dateLabels: DateRangeLabels;
  onDateRangeChange: (value: DateRangeValue) => void;
  primarySelect?: {
    value: string;
    allLabel: string;
    options: SelectOption[];
    onChange: (value: string) => void;
  };
  secondarySelect?: {
    value: string;
    allLabel: string;
    options: SelectOption[];
    onChange: (value: string) => void;
  };
};

export default function CollectionFilters({
  search,
  searchPlaceholder,
  onSearchChange,
  dateRange,
  dateLabels,
  onDateRangeChange,
  primarySelect,
  secondarySelect,
}: CollectionFiltersProps) {
  const selectClass =
    "w-full rounded-full border border-night-100 bg-white px-4 py-2.5 text-sm font-bold text-night-600 focus:outline-none focus:ring-2 focus:ring-night-300";

  return (
    <div className="mb-6 space-y-3">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-night-300"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full rounded-full border border-night-100 bg-white py-2.5 pl-10 pr-4 text-sm text-night-700 placeholder:text-night-300 focus:outline-none focus:ring-2 focus:ring-night-300"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {primarySelect ? (
          <select
            value={primarySelect.value}
            onChange={(event) => primarySelect.onChange(event.target.value)}
            className={selectClass}
          >
            <option value="">{primarySelect.allLabel}</option>
            {primarySelect.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}

        {secondarySelect ? (
          <select
            value={secondarySelect.value}
            onChange={(event) => secondarySelect.onChange(event.target.value)}
            className={selectClass}
          >
            <option value="">{secondarySelect.allLabel}</option>
            {secondarySelect.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={dateRange.preset}
          onChange={(event) =>
            onDateRangeChange({
              ...dateRange,
              preset: event.target.value as DateRangeValue["preset"],
            })
          }
          className={selectClass}
        >
          <option value="all">{dateLabels.all}</option>
          <option value="7d">{dateLabels.last7}</option>
          <option value="30d">{dateLabels.last30}</option>
          <option value="90d">{dateLabels.last90}</option>
          <option value="custom">{dateLabels.custom}</option>
        </select>
      </div>

      {dateRange.preset === "custom" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold uppercase tracking-wide text-night-400">
            <span className="mb-1 block">{dateLabels.from}</span>
            <input
              type="date"
              value={dateRange.from}
              onChange={(event) =>
                onDateRangeChange({ ...dateRange, from: event.target.value })
              }
              className="w-full rounded-xl border border-night-100 bg-white px-4 py-2.5 text-sm font-bold text-night-600 focus:outline-none focus:ring-2 focus:ring-night-300"
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-night-400">
            <span className="mb-1 block">{dateLabels.to}</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(event) =>
                onDateRangeChange({ ...dateRange, to: event.target.value })
              }
              className="w-full rounded-xl border border-night-100 bg-white px-4 py-2.5 text-sm font-bold text-night-600 focus:outline-none focus:ring-2 focus:ring-night-300"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
