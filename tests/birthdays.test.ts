import { describe, expect, it } from "vitest";
import {
  birthdayIn,
  birthdayRow,
  formatBirthday,
  nextBirthday,
  sortForBirthdays,
} from "@/lib/birthdays";
import { toDateString } from "@/lib/keep-in-touch";

describe("birthdayIn", () => {
  it("is the same day in any year for an ordinary date", () => {
    expect(birthdayIn(2027, 11, 25, null)).toBe("2027-11-25");
  });

  it("celebrates 29 February on the chosen day in a common year, on 29 February in a leap one", () => {
    expect(birthdayIn(2027, 2, 29, "feb_28")).toBe("2027-02-28");
    expect(birthdayIn(2027, 2, 29, "mar_1")).toBe("2027-03-01");
    expect(birthdayIn(2028, 2, 29, "mar_1")).toBe("2028-02-29");
  });
});

describe("nextBirthday (requirement «Ближайший день рождения»)", () => {
  it("scenario «Через Новый год»: 29 December, birthday 2 January - 4 days", () => {
    expect(nextBirthday(1, 2, null, "2026-12-29")).toEqual({ on: "2027-01-02", days: 4 });
  });

  it("scenario «Вчера»: 22 November, birthday 21 November - yesterday", () => {
    expect(nextBirthday(11, 21, null, "2026-11-22")).toEqual({ on: "2026-11-21", days: -1 });
  });

  it("scenario «Вчера через Новый год»: 1 January 2027, birthday 31 December - yesterday, 31 December 2026", () => {
    expect(nextBirthday(12, 31, null, "2027-01-01")).toEqual({ on: "2026-12-31", days: -1 });
  });

  it("scenario «Позавчера»: 22 November 2026, birthday 20 November - next is 20 November 2027", () => {
    expect(nextBirthday(11, 20, null, "2026-11-22")).toEqual({ on: "2027-11-20", days: 363 });
  });

  it("scenario «29 февраля по умолчанию в невисокосный год»: 25 February 2027, choice 28 February - 3 days", () => {
    expect(nextBirthday(2, 29, "feb_28", "2027-02-25")).toEqual({ on: "2027-02-28", days: 3 });
  });

  it("scenario «1 марта по выбору»: 25 February 2027, choice 1 March - 4 days", () => {
    expect(nextBirthday(2, 29, "mar_1", "2027-02-25")).toEqual({ on: "2027-03-01", days: 4 });
  });

  it("scenario «29 февраля в високосный год»: 25 February 2028, any choice - 29 February, 4 days", () => {
    expect(nextBirthday(2, 29, "feb_28", "2028-02-25")).toEqual({ on: "2028-02-29", days: 4 });
    expect(nextBirthday(2, 29, "mar_1", "2028-02-25")).toEqual({ on: "2028-02-29", days: 4 });
  });

  it("scenario «Часовой пояс владельца»: 00:30 on 25 November in Moscow, still 24 November in UTC - today", () => {
    const today = toDateString(new Date("2026-11-24T21:30:00Z"));
    expect(nextBirthday(11, 25, null, today).days).toBe(0);
  });

  it("counts 1 March chosen for 29 February as yesterday on 2 March", () => {
    expect(nextBirthday(2, 29, "mar_1", "2027-03-02")).toEqual({ on: "2027-03-01", days: -1 });
  });
});

describe("sortForBirthdays (requirement «Блок „Скоро день рождения“»)", () => {
  const names = (items: { name: string }[]) => items.map((item) => item.name);

  it("scenario «Опоздавшие сверху, дальше ближайшие»", () => {
    const sorted = sortForBirthdays([
      { name: "Анна", days: 5 },
      { name: "Борис", days: 0 },
      { name: "Вера", days: 1 },
      { name: "Глеб", days: -1 },
    ]);
    expect(names(sorted)).toEqual(["Глеб", "Борис", "Вера", "Анна"]);
  });

  it("scenario «Одинаковый день»: by name", () => {
    const sorted = sortForBirthdays([
      { name: "Вера", days: 2 },
      { name: "Анна", days: 2 },
    ]);
    expect(names(sorted)).toEqual(["Анна", "Вера"]);
  });

  it("scenario «Граница окна»: 7 days in, 8 days and the day before yesterday out", () => {
    const today = "2026-11-22";
    const items = [
      { name: "Через 7", ...nextBirthday(11, 29, null, today) },
      { name: "Через 8", ...nextBirthday(11, 30, null, today) },
      { name: "Позавчера", ...nextBirthday(11, 20, null, today) },
    ];
    expect(names(sortForBirthdays(items))).toEqual(["Через 7"]);
  });
});

describe("birthdayRow (requirement «Строка блока „Скоро день рождения“»)", () => {
  const row = birthdayRow;

  it("scenario «Вчера с годом»", () => {
    expect(row({ day: 21, month: 11, year: 1990, leapDay: null }, "2026-11-22")).toEqual({
      days: -1,
      when: "Вчера",
      date: "21 ноября",
      age: "исполнилось 36",
    });
  });

  it("scenario «Сегодня с годом»", () => {
    expect(row({ day: 22, month: 11, year: 1990, leapDay: null }, "2026-11-22")).toEqual({
      days: 0,
      when: "Сегодня",
      date: "22 ноября",
      age: "исполняется 36",
    });
  });

  it("scenario «Завтра без года»: no age", () => {
    expect(row({ day: 23, month: 11, year: null, leapDay: null }, "2026-11-22")).toEqual({
      days: 1,
      when: "Завтра",
      date: "23 ноября",
      age: null,
    });
  });

  it("scenario «Послезавтра»", () => {
    expect(row({ day: 24, month: 11, year: null, leapDay: null }, "2026-11-22").when).toBe(
      "Послезавтра",
    );
  });

  it("scenario «Через несколько дней»", () => {
    expect(row({ day: 25, month: 11, year: 1990, leapDay: null }, "2026-11-22")).toEqual({
      days: 3,
      when: "Через 3 дня",
      date: "25 ноября",
      age: "исполнится 36",
    });
  });

  it("scenario «Через 5 и 7 дней»", () => {
    const today = "2026-11-22";
    expect(row({ day: 27, month: 11, year: null, leapDay: null }, today).when).toBe("Через 5 дней");
    expect(row({ day: 29, month: 11, year: null, leapDay: null }, today).when).toBe("Через 7 дней");
  });

  it("scenario «Возраст через Новый год»", () => {
    expect(row({ day: 2, month: 1, year: 2000, leapDay: null }, "2026-12-29")).toEqual({
      days: 4,
      when: "Через 4 дня",
      date: "2 января",
      age: "исполнится 27",
    });
  });

  it("scenario «Дата 29 февраля в строке»: the day it is celebrated this year", () => {
    expect(row({ day: 29, month: 2, year: null, leapDay: "mar_1" }, "2027-02-27")).toEqual({
      days: 2,
      when: "Послезавтра",
      date: "1 марта",
      age: null,
    });
  });

  it("counts the age of yesterday across the New Year by the year it was celebrated in", () => {
    expect(row({ day: 31, month: 12, year: 1990, leapDay: null }, "2027-01-01").age).toBe(
      "исполнилось 36",
    );
  });
});

describe("formatBirthday (requirement «День рождения в карточке»)", () => {
  it("scenario «Карточка с датой»: 25 November 1990", () => {
    expect(formatBirthday({ day: 25, month: 11, year: 1990, leapDay: null })).toBe(
      "25 ноября 1990",
    );
  });

  it("gives the date without the year when it is unknown", () => {
    expect(formatBirthday({ day: 3, month: 3, year: null, leapDay: null })).toBe("3 марта");
  });

  it("scenario «Карточка с 29 февраля»: the date and the choice for a common year", () => {
    expect(formatBirthday({ day: 29, month: 2, year: 1992, leapDay: "mar_1" })).toBe(
      "29 февраля 1992 · в невисокосный год — 1 марта",
    );
    expect(formatBirthday({ day: 29, month: 2, year: null, leapDay: "feb_28" })).toBe(
      "29 февраля · в невисокосный год — 28 февраля",
    );
  });
});
