// Due dates and statuses for "keep in touch". Pure functions, no database.
// Dates are plain "YYYY-MM-DD" strings: calendar arithmetic without time zones leaking in.

export const CADENCES = ["week", "month", "quarter", "half_year", "year", "date"] as const;
export type Cadence = (typeof CADENCES)[number];
export type Period = Exclude<Cadence, "date">;
export type StatusKind = "overdue" | "soon" | "ok";
export type Status = { kind: StatusKind; days: number };

// One owner, one time zone; changing it is a one-line edit
export const APP_TIME_ZONE = "Europe/Moscow";

const DAY_MS = 24 * 60 * 60 * 1000;

const PERIODS: Record<Period, { days: number } | { months: number }> = {
  week: { days: 7 },
  month: { months: 1 },
  quarter: { months: 3 },
  half_year: { months: 6 },
  year: { months: 12 },
};

// How many days before the due date (inclusive) a contact counts as "soon"
const SOON_WINDOW_DAYS: Record<Cadence, number> = {
  week: 2,
  month: 7,
  quarter: 7,
  half_year: 7,
  year: 7,
  date: 7,
};

function parseDate(date: string) {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// The calendar day a moment falls on in the given time zone
export function toDateString(moment: Date, timeZone: string = APP_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(moment);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Whole days from `from` to `to`; negative when `to` is earlier
export function daysBetween(from: string, to: string): number {
  const a = parseDate(from);
  const b = parseDate(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}

// Adds a period; a month that is too short for the day gives the last day of that month
export function addPeriod(date: string, period: Period): string {
  const { year, month, day } = parseDate(date);
  const step = PERIODS[period];

  if ("days" in step) {
    const moved = new Date(Date.UTC(year, month - 1, day + step.days));
    return formatDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
  }

  const monthIndex = month - 1 + step.months;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = monthIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return formatDate(targetYear, targetMonth + 1, Math.min(day, lastDay));
}

// Null when no cadence is set. `lastContact` is the latest note, or the contact's creation moment
export function dueDate(cadence: Cadence | null, lastContact: Date, contactOn: string | null): string | null {
  if (cadence === null) return null;
  if (cadence === "date") return contactOn;
  return addPeriod(toDateString(lastContact), cadence);
}

// `days` is how long overdue, or how many days are left (0 on the due day)
export function status(due: string, today: string, cadence: Cadence): Status {
  const daysLeft = daysBetween(today, due);
  if (daysLeft < 0) return { kind: "overdue", days: -daysLeft };
  return { kind: daysLeft <= SOON_WINDOW_DAYS[cadence] ? "soon" : "ok", days: daysLeft };
}

// The "Пора связаться" block: overdue first (the longer overdue, the higher),
// then soon (the closer, the higher); ties by name. Contacts that are fine are left out.
export function sortForReminders<T extends { name: string; status: Status }>(items: T[]): T[] {
  return items
    .filter((item) => item.status.kind !== "ok")
    .sort((a, b) => {
      if (a.status.kind !== b.status.kind) return a.status.kind === "overdue" ? -1 : 1;
      const byDays = a.status.kind === "overdue" ? b.status.days - a.status.days : a.status.days - b.status.days;
      return byDays || a.name.localeCompare(b.name, "ru");
    });
}

export const CADENCE_LABELS: Record<Cadence, string> = {
  week: "Раз в неделю",
  month: "Раз в месяц",
  quarter: "Раз в 3 месяца",
  half_year: "Раз в 6 месяцев",
  year: "Раз в год",
  date: "Конкретная дата",
};

const dueDateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const dueDateYearFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// "15 ноября"; the year is added when the date is not in the current one ("раз в год" lands there)
export function formatDueDate(date: string, today: string = toDateString(new Date())): string {
  const { year, month, day } = parseDate(date);
  const moment = new Date(Date.UTC(year, month - 1, day));
  return (parseDate(today).year === year ? dueDateFormat : dueDateYearFormat).format(moment);
}

// The term in a block row: "просрочено на 13 дней", "Срок — сегодня", "До 1 ноября"
export function dueText(current: Status, dueOn: string, today?: string): string {
  if (current.kind === "overdue") return `просрочено на ${pluralDays(current.days)}`;
  if (current.days === 0) return "Срок — сегодня";
  return `До ${formatDueDate(dueOn, today)}`;
}

// "1 день", "2 дня", "5 дней", "11 дней", "21 день"
export function pluralDays(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return `${count} день`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} дня`;
  return `${count} дней`;
}
