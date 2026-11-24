import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BirthdaysBlock, type BirthdayBlockRow } from "@/components/birthdays-block";

// The server render of the «Скоро день рождения» block: what a visitor sees before (or without) JavaScript

function render(rows: BirthdayBlockRow[], returnTo = "/") {
  return renderToStaticMarkup(createElement(BirthdaysBlock, { rows, returnTo }));
}

function tomorrowRows(count: number): BirthdayBlockRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Контакт ${index + 1}`,
    days: 1,
    when: "Завтра",
    date: "23 ноября",
    age: null,
  }));
}

describe("BirthdaysBlock rows", () => {
  it("scenario «Пять и меньше»: 3 at the title, all 3 rows, no «Показать все»", () => {
    const html = render(tomorrowRows(3));
    expect(html).toContain("Скоро день рождения");
    expect(html).toMatch(/>3<\/span>/);
    expect(html).toContain("Контакт 3");
    expect(html).not.toContain("data-row-out");
    expect(html).not.toContain("Показать все");
    expect(html).not.toContain("Свернуть");
  });

  it("scenario «Больше пяти»: 8 at the title, «Показать все (8)», rows past the first 5 marked", () => {
    const html = render(tomorrowRows(8));
    expect(html).toMatch(/>8<\/span>/);
    expect(html).toContain("Показать все (8)");
    expect(html.split("data-row-out").length - 1).toBe(3);
    // Every row is still in the page, so without JavaScript all of them are visible
    expect(html).toContain("Контакт 8");
  });

  it("a row links to the card and reads «when · date · age»; without the year no age", () => {
    const html = render([
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Анна Смирнова",
        days: 0,
        when: "Сегодня",
        date: "22 ноября",
        age: "исполняется 36",
      },
      { ...tomorrowRows(1)[0], id: "00000000-0000-4000-8000-000000000002", name: "Вера" },
    ]);
    expect(html).toContain('href="/contacts/00000000-0000-4000-8000-000000000001"');
    expect(html).toContain("Сегодня · 22 ноября · исполняется 36");
    expect(html).toContain("Завтра · 23 ноября<");
  });

  it("a row has «Поздравил(а)» with the name in its label and the page to return to (requirement «Отметка «Поздравил(а)»»)", () => {
    const groupPage = "/groups/3f1c2b9e-7a4d-4e8f-9b2a-1c5d6e7f8a90";
    const html = render(tomorrowRows(2), groupPage);
    expect(html.split('aria-label="Поздравил(а): ').length - 1).toBe(2);
    expect(html).toContain('aria-label="Поздравил(а): Контакт 1"');
    expect(html).toContain('name="contactId" value="00000000-0000-4000-8000-000000000000"');
    expect(html.split(`name="returnTo" value="${groupPage}"`).length - 1).toBe(2);
    // The text next to the icon, hidden on phones only
    expect(html).toContain(">Поздравил(а)</span>");
  });

  it("dots (decision 39): yesterday as overdue, today as soon, none later", () => {
    const row = (days: number) => ({ ...tomorrowRows(1)[0], days });
    expect(render([row(-1)])).toContain("animate-due-overdue");
    expect(render([row(0)])).toContain("animate-due-soon");
    const later = render([row(1)]);
    expect(later).not.toContain("animate-due-overdue");
    expect(later).not.toContain("animate-due-soon");
  });
});
