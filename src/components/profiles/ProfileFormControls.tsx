"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { formStyles, pillClassName } from "@/components/ui/formStyles";
import { LESSON_OPTIONS } from "@/types";

type MonthOption = {
  value: number;
  label: string;
};

type TagsFieldProps = {
  label: string;
  values: string[];
  onChange: (vals: string[]) => void;
  placeholder: string;
  addLabel?: string;
};

export function TagsField({
  label,
  values,
  onChange,
  placeholder,
  addLabel = "Add",
}: TagsFieldProps) {
  const [input, setInput] = useState("");

  function add() {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setInput("");
  }

  function remove(value: string) {
    onChange(values.filter((item) => item !== value));
  }

  return (
    <div>
      <label className={formStyles.label}>{label}</label>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={formStyles.field}
        />
        <Button variant="secondary" size="compact" onClick={add}>
          {addLabel}
        </Button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => (
            <span
              key={value}
              className="flex items-center gap-1.5 rounded-full bg-star-100 px-3 py-1 text-sm font-bold text-star-700"
            >
              {value}
              <button
                type="button"
                onClick={() => remove(value)}
                className="text-star-500 hover:text-star-700"
                aria-label={`Remove ${value}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type BirthdayFieldsProps = {
  title: string;
  hint: string;
  dayLabel: string;
  monthLabel: string;
  yearLabel: string;
  months: MonthOption[];
  day: string;
  month: string;
  year: string;
  onDayChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onYearChange: (value: string) => void;
};

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 15 }, (_, index) => currentYear - index);
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

export function BirthdayFields({
  title,
  hint,
  dayLabel,
  monthLabel,
  yearLabel,
  months,
  day,
  month,
  year,
  onDayChange,
  onMonthChange,
  onYearChange,
}: BirthdayFieldsProps) {
  return (
    <div>
      <p className={formStyles.label}>{title}</p>
      <p className={formStyles.hint}>{hint}</p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={formStyles.subLabel} htmlFor="dob-day">
            {dayLabel}
          </label>
          <select
            id="dob-day"
            value={day}
            onChange={(event) => onDayChange(event.target.value)}
            className={formStyles.select}
          >
            <option value="">-</option>
            {DAYS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={formStyles.subLabel} htmlFor="dob-month">
            {monthLabel}
          </label>
          <select
            id="dob-month"
            value={month}
            onChange={(event) => onMonthChange(event.target.value)}
            className={formStyles.select}
          >
            <option value="">-</option>
            {months.map((value) => (
              <option key={value.value} value={value.value}>
                {value.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={formStyles.subLabel} htmlFor="dob-year">
            {yearLabel}
          </label>
          <select
            id="dob-year"
            value={year}
            onChange={(event) => onYearChange(event.target.value)}
            className={formStyles.select}
          >
            <option value="">-</option>
            {YEARS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

type LessonsFieldProps = {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
};

export function LessonsField({ label, values, onChange }: LessonsFieldProps) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-night-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {LESSON_OPTIONS.map((lesson) => (
          <button
            key={lesson}
            type="button"
            onClick={() =>
              onChange(
                values.includes(lesson)
                  ? values.filter((item) => item !== lesson)
                  : [...values, lesson]
              )
            }
            className={pillClassName(values.includes(lesson))}
          >
            {lesson}
          </button>
        ))}
      </div>
    </div>
  );
}

export function parseDateOfBirth(dateOfBirth?: string) {
  if (!dateOfBirth) return { day: "", month: "", year: "" };

  const [year, month, day] = dateOfBirth.split("-");
  return {
    day: String(parseInt(day, 10)),
    month: String(parseInt(month, 10)),
    year,
  };
}

export function fallbackBirthYear(age?: number) {
  return String(currentYear - (age ?? 0));
}
