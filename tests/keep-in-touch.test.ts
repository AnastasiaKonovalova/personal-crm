import { describe, expect, it } from "vitest";
import {
  addPeriod,
  daysBetween,
  dueDate,
  dueText,
  formatDueDate,
  pluralDays,
  sortForReminders,
  status,
  toDateString,
} from "@/lib/keep-in-touch";

describe("toDateString", () => {
  it("takes the calendar day in the app time zone, not in UTC", () => {
    // 21:30 UTC on 31 October is already 1 November in Moscow (UTC+3)
    expect(toDateString(new Date("2026-10-31T21:30:00Z"))).toBe("2026-11-01");
    expect(toDateString(new Date("2026-10-31T20:30:00Z"))).toBe("2026-10-31");
  });
});

describe("daysBetween", () => {
  it("counts days across month and year borders, negative backwards", () => {
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-10-30", "2026-10-29")).toBe(-1);
    expect(daysBetween("2026-10-30", "2026-10-30")).toBe(0);
  });
});

describe("addPeriod", () => {
  it("adds a calendar month", () => {
    expect(addPeriod("2026-10-15", "month")).toBe("2026-11-15");
  });

  it("clamps to the last day of a shorter month", () => {
    expect(addPeriod("2026-01-31", "month")).toBe("2026-02-28");
  });

  it("gives 29 February in a leap year", () => {
    expect(addPeriod("2028-01-31", "month")).toBe("2028-02-29");
  });

  it("adds a week across the year border", () => {
    expect(addPeriod("2026-12-28", "week")).toBe("2027-01-04");
  });

  it("adds quarters and half-years across the year border", () => {
    expect(addPeriod("2026-11-30", "quarter")).toBe("2027-02-28");
    expect(addPeriod("2026-10-31", "half_year")).toBe("2027-04-30");
  });

  it("adds a year, clamping 29 February", () => {
    expect(addPeriod("2027-05-10", "year")).toBe("2028-05-10");
    expect(addPeriod("2028-02-29", "year")).toBe("2029-02-28");
  });
});

describe("dueDate", () => {
  it("has no due date without a cadence", () => {
    expect(dueDate(null, new Date("2026-10-15T09:00:00Z"), null)).toBeNull();
  });

  it("counts a contact without notes from its creation", () => {
    expect(dueDate("month", new Date("2026-01-10T09:00:00Z"), null)).toBe("2026-02-10");
  });

  it("counts from the calendar day in the app time zone", () => {
    expect(dueDate("month", new Date("2026-10-31T21:30:00Z"), null)).toBe("2026-12-01");
  });

  it("uses the chosen date for a specific date, whatever the last contact", () => {
    expect(dueDate("date", new Date("2026-10-15T09:00:00Z"), "2026-11-15")).toBe("2026-11-15");
  });
});

describe("status", () => {
  it("is soon, not overdue, on the due day", () => {
    expect(status("2026-10-30", "2026-10-30", "month")).toEqual({ kind: "soon", days: 0 });
  });

  it("is overdue by one day when the due date was yesterday", () => {
    expect(status("2026-10-29", "2026-10-30", "month")).toEqual({ kind: "overdue", days: 1 });
  });

  it("uses a 2-day window for a week", () => {
    expect(status("2026-11-02", "2026-10-30", "week")).toEqual({ kind: "ok", days: 3 });
    expect(status("2026-11-01", "2026-10-30", "week")).toEqual({ kind: "soon", days: 2 });
  });

  it("uses a 7-day window for a month and a specific date", () => {
    expect(status("2026-11-06", "2026-10-30", "month")).toEqual({ kind: "soon", days: 7 });
    expect(status("2026-11-07", "2026-10-30", "month")).toEqual({ kind: "ok", days: 8 });
    expect(status("2026-11-06", "2026-10-30", "date")).toEqual({ kind: "soon", days: 7 });
  });
});

describe("sortForReminders", () => {
  const today = "2026-10-30";
  const item = (name: string, cadence: "week" | "month", lastContact: string) => ({
    name,
    status: status(dueDate(cadence, new Date(`${lastContact}T09:00:00Z`), null) as string, today, cadence),
  });

  it("puts the contact longer overdue higher", () => {
    // Anna: weekly, last contact 20 days ago, 13 days overdue; Boris: monthly, 10 days overdue
    const anna = item("Анна", "week", "2026-10-10");
    const boris = item("Борис", "month", "2026-09-20");
    expect(anna.status).toEqual({ kind: "overdue", days: 13 });
    expect(boris.status).toEqual({ kind: "overdue", days: 10 });
    expect(sortForReminders([boris, anna]).map((entry) => entry.name)).toEqual(["Анна", "Борис"]);
  });

  it("puts soon below overdue, the closer due date first", () => {
    const overdue = { name: "Яна", status: { kind: "overdue", days: 1 } as const };
    const tomorrow = { name: "Антон", status: { kind: "soon", days: 1 } as const };
    const inFive = { name: "Алла", status: { kind: "soon", days: 5 } as const };
    expect(sortForReminders([inFive, tomorrow, overdue]).map((entry) => entry.name)).toEqual([
      "Яна",
      "Антон",
      "Алла",
    ]);
  });

  it("breaks ties by name", () => {
    const first = { name: "Ёлкин", status: { kind: "overdue", days: 3 } as const };
    const second = { name: "Яковлев", status: { kind: "overdue", days: 3 } as const };
    const third = { name: "Абрамов", status: { kind: "overdue", days: 3 } as const };
    expect(sortForReminders([second, first, third]).map((entry) => entry.name)).toEqual([
      "Абрамов",
      "Ёлкин",
      "Яковлев",
    ]);
  });

  it("leaves out contacts that are fine", () => {
    const fine = { name: "Вера", status: { kind: "ok", days: 20 } as const };
    expect(sortForReminders([fine])).toEqual([]);
  });
});

describe("formatDueDate", () => {
  it("omits the year within the current year and adds it otherwise", () => {
    expect(formatDueDate("2026-11-15", "2026-10-30")).toBe("15 ноября");
    expect(formatDueDate("2027-01-03", "2026-10-30")).toBe("3 января 2027 г.");
  });
});

describe("dueText", () => {
  const today = "2026-10-30";

  it("says how long overdue", () => {
    expect(dueText({ kind: "overdue", days: 13 }, "2026-10-17", today)).toBe("просрочено на 13 дней");
    expect(dueText({ kind: "overdue", days: 1 }, "2026-10-29", today)).toBe("просрочено на 1 день");
  });

  it("names the due day today, otherwise the date", () => {
    expect(dueText({ kind: "soon", days: 0 }, today, today)).toBe("Срок — сегодня");
    expect(dueText({ kind: "soon", days: 2 }, "2026-11-01", today)).toBe("До 1 ноября");
  });
});

describe("pluralDays", () => {
  it("declines in Russian", () => {
    expect(pluralDays(1)).toBe("1 день");
    expect(pluralDays(2)).toBe("2 дня");
    expect(pluralDays(5)).toBe("5 дней");
    expect(pluralDays(11)).toBe("11 дней");
    expect(pluralDays(12)).toBe("12 дней");
    expect(pluralDays(21)).toBe("21 день");
    expect(pluralDays(22)).toBe("22 дня");
    expect(pluralDays(0)).toBe("0 дней");
  });
});
