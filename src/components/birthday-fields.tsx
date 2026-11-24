"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { FieldError } from "@/components/field-error";
import { fieldClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DAYS = Array.from({ length: 31 }, (_, index) => String(index + 1));
const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];
const LEAP_CHOICES = [
  { value: "feb_28", label: "28 февраля" },
  { value: "mar_1", label: "1 марта" },
];

const ERROR_ID = "birthDay-error";

// The caption inside the field, as in the group filter (design decision 26)
const captionClasses =
  "pointer-events-none absolute top-[9px] left-[21px] z-1 font-sans text-pill font-semibold tracking-normal text-muted-foreground";
const captionedField = cn(fieldClasses, "rounded-card pt-[27px] pb-[9px]");

// «День рождения» in the contact form (design decision 41): native day and month selects with «—» for
// "not set", an optional year, one error under the row. The choice for 29 February in a common year is
// always in the markup: without JavaScript it is always visible (the server keeps it only for 29 February),
// with JavaScript globals.css hides it for any other date
export function BirthdayFields({
  defaultDay,
  defaultMonth,
  defaultYear,
  defaultLeapDay,
  errors,
}: {
  defaultDay: string;
  defaultMonth: string;
  defaultYear: string;
  defaultLeapDay: string;
  errors?: { birthDay?: string; birthLeapDay?: string };
}) {
  const [day, setDay] = useState(defaultDay);
  const [month, setMonth] = useState(defaultMonth);
  const error = errors?.birthDay;
  // The one error of the row marks the fields it is about (mockup design/contact-form.html):
  // a date that does not exist - day and month; a wrong year - the year; a missing pair - all three
  const marks = (part: "date" | "year") => {
    const on =
      error !== undefined &&
      (error === "Такой даты нет"
        ? part === "date"
        : error === "Проверь год"
          ? part === "year"
          : true);
    return { "aria-invalid": on || undefined, "aria-describedby": on ? ERROR_ID : undefined };
  };

  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="mb-2 font-sans text-nav leading-none font-semibold text-ink">
        День рождения
      </legend>
      <div className="flex flex-wrap gap-cta">
        <span className="relative flex-[0_0_112px]">
          <label htmlFor="birthDay" className={captionClasses}>
            День
          </label>
          <select
            id="birthDay"
            name="birthDay"
            defaultValue={defaultDay}
            onChange={(event) => setDay(event.target.value)}
            className={cn(captionedField, "cursor-pointer appearance-none pr-12")}
            {...marks("date")}
          >
            <option value="">—</option>
            {DAYS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className={chevronClasses} />
        </span>
        <span className="relative max-w-60 flex-[1_1_170px]">
          <label htmlFor="birthMonth" className={captionClasses}>
            Месяц
          </label>
          <select
            id="birthMonth"
            name="birthMonth"
            defaultValue={defaultMonth}
            onChange={(event) => setMonth(event.target.value)}
            className={cn(captionedField, "cursor-pointer appearance-none pr-12")}
            {...marks("date")}
          >
            <option value="">—</option>
            {MONTHS.map((label, index) => (
              <option key={label} value={String(index + 1)}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" className={chevronClasses} />
        </span>
        <span className="relative flex-[0_0_172px]">
          <label htmlFor="birthYear" className={captionClasses}>
            Год
          </label>
          <input
            id="birthYear"
            name="birthYear"
            inputMode="numeric"
            maxLength={4}
            autoComplete="off"
            placeholder="необязательно"
            defaultValue={defaultYear}
            className={captionedField}
            {...marks("year")}
          />
        </span>
      </div>
      {error && <FieldError id={ERROR_ID}>{error}</FieldError>}
      <fieldset
        data-birth-leap=""
        data-visible={day === "29" && month === "2"}
        className="mt-1.5 grid min-w-0 gap-2"
      >
        <legend className="mb-2 font-sans text-caption leading-none font-semibold text-muted-foreground">
          В невисокосный год
        </legend>
        <div className="flex min-w-0 flex-wrap gap-tag">
          {LEAP_CHOICES.map((choice) => (
            <label
              key={choice.value}
              className="group/pick relative inline-flex cursor-pointer items-center gap-1.5 rounded-pill border border-line bg-surface px-3.5 py-1.5 text-nav font-semibold text-ink transition-colors duration-200 hover:border-teal-deep has-checked:border-primary has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-3 has-focus-visible:outline-ring has-focus-visible:outline-solid"
            >
              <input
                type="radio"
                name="birthLeapDay"
                value={choice.value}
                defaultChecked={(defaultLeapDay || "feb_28") === choice.value}
                className="pointer-events-none absolute opacity-0"
              />
              <Check
                aria-hidden="true"
                className="hidden size-4 shrink-0 group-has-checked/pick:block"
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
        {errors?.birthLeapDay && <FieldError>{errors.birthLeapDay}</FieldError>}
      </fieldset>
    </fieldset>
  );
}

const chevronClasses =
  "pointer-events-none absolute top-1/2 right-[18px] size-5 -translate-y-1/2 text-muted-foreground";
