import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContactsSearch } from "@/components/contacts-search";
import { EmptyList } from "@/components/empty-list";

// The server render of the search row and the group filter: what a visitor sees before (or without) JavaScript

const TENNIS = "11111111-1111-4111-8111-111111111111";
const FAMILY = "22222222-2222-4222-8222-222222222222";
const groups = [
  { id: FAMILY, name: "Семья" },
  { id: TENNIS, name: "Теннис" },
];

function render(props: { query?: string; groupId?: string }) {
  return renderToStaticMarkup(createElement(ContactsSearch, { query: "", groups, ...props }));
}

function options(html: string) {
  return [...html.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map(([, attrs, text]) => ({
    value: attrs.match(/value="([^"]*)"/)?.[1],
    selected: /selected=""/.test(attrs),
    text,
  }));
}

describe("ContactsSearch", () => {
  it("has the group filter in the same form, «Все группы» first, groups in the given order", () => {
    const html = render({});
    expect(html).toMatch(/<select[^>]*name="group"/);
    expect(html).toContain("Фильтр по группам");
    expect(options(html)).toEqual([
      { value: "", selected: true, text: "Все группы" },
      { value: FAMILY, selected: false, text: "Семья" },
      { value: TENNIS, selected: false, text: "Теннис" },
    ]);
  });

  it("selects the current group", () => {
    const html = render({ groupId: TENNIS });
    expect(options(html).filter((option) => option.selected).map((option) => option.text)).toEqual(["Теннис"]);
  });

  it("labels the select with its caption", () => {
    const html = render({});
    const id = html.match(/<select[^>]*id="([^"]*)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
  });

  it("offers a link to create groups instead of the filter when there are none", () => {
    const html = renderToStaticMarkup(createElement(ContactsSearch, { query: "", groups: [] }));
    expect(html).not.toContain("<select");
    expect(html).toMatch(/<a[^>]*href="\/groups#new-group"[^>]*>Тут можно создавать группы контактов<\/a>/);
  });

  it("has no create-groups link when groups exist", () => {
    expect(render({})).not.toContain("Тут можно создавать группы контактов");
  });

  it("has no «Сбросить» without search", () => {
    expect(render({ groupId: TENNIS })).not.toContain("Сбросить");
  });

  it("resets only the search and keeps the group («Сброс поиска внутри группы»)", () => {
    const html = render({ query: "Анна", groupId: TENNIS });
    const reset = html.match(/<a([^>]*)>Сбросить<\/a>/)?.[1] ?? "";
    expect(reset).toContain(`href="/?group=${TENNIS}"`);
    expect(reset).toContain('aria-label="Сбросить поиск"');
    expect(html).toContain('value="Анна"');
  });

  it("resets to the bare main page without a group", () => {
    const html = render({ query: "Анна" });
    expect(html.match(/<a([^>]*)>Сбросить<\/a>/)?.[1]).toContain('href="/"');
  });

  it("keeps «Найти» and «Сбросить» in one wrapper that does not wrap inside", () => {
    const html = render({ query: "Анна" });
    expect(html).toMatch(/<span[^>]*class="[^"]*flex-none[^"]*"[^>]*><button[^>]*>Найти<\/button><a[^>]*>Сбросить<\/a><\/span>/);
  });
});

describe("EmptyList", () => {
  function title(props: { query: string; inGroup: boolean }) {
    return renderToStaticMarkup(createElement(EmptyList, props)).match(/<h2[^>]*>([^<]*)<\/h2>/)?.[1];
  }

  it("says the group is empty («Пустая группа»)", () => {
    expect(title({ query: "", inGroup: true })).toBe("В группе пока никого нет");
  });

  it("keeps the search and no-contacts states", () => {
    expect(title({ query: "Анна", inGroup: true })).toBe("По запросу «Анна» никого не нашлось");
    expect(title({ query: "", inGroup: false })).toBe("Контактов пока нет");
  });
});
