import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyList } from "@/components/empty-list";

// Empty state of the contact list (mockups contacts-first.html, contacts-not-found.html, contacts-group-empty.html).
// data-ownership, «Первый вход»: a new user sees «Добавь первый контакт»

function render(props: Parameters<typeof EmptyList>[0]) {
  return renderToStaticMarkup(createElement(EmptyList, props));
}

describe("EmptyList", () => {
  it("no contacts at all: «Контактов пока нет» and the hint «Добавь первый контакт»", () => {
    const html = render({ query: "", inGroup: false });
    expect(html).toContain("Контактов пока нет");
    expect(html).toContain("Добавь первый контакт");
  });

  it("nothing found by search: no first-contact hint", () => {
    const html = render({ query: "Морозов", inGroup: false });
    expect(html).toContain("По запросу «Морозов» никого не нашлось");
    expect(html).not.toContain("Добавь первый контакт");
  });

  it("empty group: no first-contact hint, the group page hint stays", () => {
    const html = render({ query: "", inGroup: true, hint: "Подсказка группы" });
    expect(html).toContain("В группе пока никого нет");
    expect(html).toContain("Подсказка группы");
    expect(html).not.toContain("Добавь первый контакт");
  });
});
