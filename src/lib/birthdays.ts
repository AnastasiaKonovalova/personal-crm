// Birthdays: when the next one is, how old the person turns, the texts of a block row. Pure functions,
// "today" is a "YYYY-MM-DD" string in the app time zone (toDateString), passed in by the caller.

import {
  SOON_DAYS,
  daysBetween,
  formatDate,
  formatDayMonth,
  parseDate,
  pluralDays,
} from "@/lib/keep-in-touch";

export const LEAP_DAYS = ["feb_28", "mar_1"] as const;
// The day a 29 February birthday is celebrated in a common year
export type LeapDay = (typeof LEAP_DAYS)[number];

export type Birthday = { day: number; month: number; year: number | null; leapDay: LeapDay | null };

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// The date the birthday is celebrated on in the given year
export function birthdayIn(
  year: number,
  month: number,
  day: number,
  leapDay: LeapDay | null,
): string {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return leapDay === "mar_1" ? formatDate(year, 3, 1) : formatDate(year, 2, 28);
  }
  return formatDate(year, month, day);
}

// The birthday to show: yesterday's (-1), today's (0) or the nearest one ahead, across the New Year too
export function nextBirthday(
  month: number,
  day: number,
  leapDay: LeapDay | null,
  today: string,
): { on: string; days: number } {
  const { year } = parseDate(today);
  for (const candidate of [year - 1, year, year + 1]) {
    const on = birthdayIn(candidate, month, day, leapDay);
    const days = daysBetween(today, on);
    if (days >= -1) return { on, days };
  }
  // Unreachable: next year's date is always ahead
  throw new Error("No birthday ahead");
}

// The age turned on the celebrated date
export function ageOn(birthYear: number, celebratedOn: string): number {
  return parseDate(celebratedOn).year - birthYear;
}

// The "Скоро день рождения" block: from yesterday to SOON_DAYS ahead, yesterday's first, then the
// nearest; ties by name
export function sortForBirthdays<T extends { name: string; days: number }>(items: T[]): T[] {
  return items
    .filter((item) => item.days >= -1 && item.days <= SOON_DAYS)
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, "ru"));
}

// "Вчера", "Сегодня", "Завтра", "Послезавтра", "Через 3 дня"
export function whenText(days: number): string {
  if (days === -1) return "Вчера";
  if (days === 0) return "Сегодня";
  if (days === 1) return "Завтра";
  if (days === 2) return "Послезавтра";
  return `Через ${pluralDays(days)}`;
}

// "исполнилось 36" yesterday, "исполняется 36" today, "исполнится 36" later
export function ageText(days: number, age: number): string {
  const verb = days < 0 ? "исполнилось" : days === 0 ? "исполняется" : "исполнится";
  return `${verb} ${age}`;
}

const LEAP_DAY_LABELS: Record<LeapDay, string> = { feb_28: "28 февраля", mar_1: "1 марта" };

// The card row: "25 ноября 1990", "25 ноября" without the year, and for 29 February also the choice:
// "29 февраля 1992 · в невисокосный год — 1 марта". Only the date: no "in N days" and no age
export function formatBirthday({ day, month, year, leapDay }: Birthday): string {
  // 2000 is a leap year: 29 February exists in it
  const date = formatDayMonth(formatDate(2000, month, day));
  const withYear = year === null ? date : `${date} ${year}`;
  return leapDay ? `${withYear} · в невисокосный год — ${LEAP_DAY_LABELS[leapDay]}` : withYear;
}

// What a block row shows; `age` is null when the year is unknown
export function birthdayRow(
  { day, month, year, leapDay }: Birthday,
  today: string,
): { days: number; when: string; date: string; age: string | null } {
  const { on, days } = nextBirthday(month, day, leapDay, today);
  return {
    days,
    when: whenText(days),
    date: formatDayMonth(on),
    age: year === null ? null : ageText(days, ageOn(year, on)),
  };
}
