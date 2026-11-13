import { describe, expect, it } from "vitest";
import { contactsHref, groupPageHref, listCaption } from "@/lib/contact-list";

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

describe("groupPageHref", () => {
  it("is the bare group page without search and page («Сброс поиска в группе»)", () => {
    expect(groupPageHref({ groupId: GROUP })).toBe(`/groups/${GROUP}`);
    expect(groupPageHref({ groupId: GROUP, query: "", page: 1 })).toBe(`/groups/${GROUP}`);
  });

  it("keeps the search in page links and stays on the group page («Страницы в группе»)", () => {
    expect(groupPageHref({ groupId: GROUP, page: 2 })).toBe(`/groups/${GROUP}?page=2`);
    expect(groupPageHref({ groupId: GROUP, query: "Анна", page: 3 })).toBe(
      `/groups/${GROUP}?q=%D0%90%D0%BD%D0%BD%D0%B0&page=3`,
    );
  });
});

describe("listCaption", () => {
  it("says «Всего» for the plain list and «Найдено» with search or a group («Список группы»)", () => {
    expect(listCaption({ total: 12, query: "", filtered: false })).toBe("Всего: 12");
    expect(listCaption({ total: 1, query: "Анна", filtered: false })).toBe("Найдено: 1");
    expect(listCaption({ total: 7, query: "", filtered: true })).toBe("Найдено: 7");
  });
});
