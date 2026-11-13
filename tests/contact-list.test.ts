import { describe, expect, it } from "vitest";
import { contactsHref, listCaption } from "@/lib/contact-list";

const GROUP = "11111111-1111-4111-8111-111111111111";

describe("contactsHref", () => {
  it("is the bare main page without search, filter and page", () => {
    expect(contactsHref({})).toBe("/");
    expect(contactsHref({ query: "", page: 1 })).toBe("/");
  });

  it("keeps the group filter in page links («Страницы с фильтром»)", () => {
    expect(contactsHref({ groupId: GROUP, page: 2 })).toBe(`/?group=${GROUP}&page=2`);
    expect(contactsHref({ query: "Анна", groupId: GROUP, page: 3 })).toBe(
      `/?q=%D0%90%D0%BD%D0%BD%D0%B0&group=${GROUP}&page=3`,
    );
  });

  it("drops only the search for «Сбросить» inside a group («Сброс поиска внутри группы»)", () => {
    expect(contactsHref({ groupId: GROUP })).toBe(`/?group=${GROUP}`);
  });
});

describe("listCaption", () => {
  it("says «Всего» for the plain list and «Найдено» with search or a group («Список группы»)", () => {
    expect(listCaption({ total: 12, query: "", filtered: false })).toBe("Всего: 12");
    expect(listCaption({ total: 1, query: "Анна", filtered: false })).toBe("Найдено: 1");
    expect(listCaption({ total: 7, query: "", filtered: true })).toBe("Найдено: 7");
  });
});
