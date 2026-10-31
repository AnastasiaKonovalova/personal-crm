import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RemindersBlock, type ReminderRow } from "@/components/reminders-block";

// The server render of the block: what a visitor sees before (or without) JavaScript

function render(rows: ReminderRow[], hasCadence: boolean) {
  return renderToStaticMarkup(createElement(RemindersBlock, { rows, hasCadence }));
}

function overdueRows(count: number): ReminderRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    name: `Контакт ${index + 1}`,
    kind: "overdue",
    text: "просрочено на 3 дня",
    cadenceLabel: "раз в неделю",
  }));
}

describe("RemindersBlock empty states", () => {
  it("says everyone is in touch, with an icon, when frequencies are set but nobody is due", () => {
    const html = render([], true);
    expect(html).toContain("Со всеми на связи");
    expect(html).toContain("<svg");
    expect(html).not.toContain("Задай частоту");
  });

  it("hints at setting a frequency when nobody has one", () => {
    const html = render([], false);
    expect(html).toContain("Задай частоту общения в карточке контакта");
    expect(html).toContain("пора связаться");
    expect(html).not.toContain("Со всеми на связи");
  });
});

describe("RemindersBlock rows", () => {
  it("has no «Показать все» button for 5 rows or fewer", () => {
    const html = render(overdueRows(3), true);
    expect(html).toContain("Контакт 3");
    expect(html).not.toContain("Показать все");
    expect(html).not.toContain("Свернуть");
  });

  it("offers «Показать все (N)» for more than 5 rows and marks the rows past the first 5", () => {
    const html = render(overdueRows(8), true);
    expect(html).toContain("Показать все (8)");
    expect(html.split("data-row-out").length - 1).toBe(3);
    // Every row is still in the page, so without JavaScript all of them are visible
    expect(html).toContain("Контакт 8");
  });
});
