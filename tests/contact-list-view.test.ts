import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContactList } from "@/components/contact-list";

// The shared list of the main page and the group page (design.md п.12): rows, pages and the empty state

const GROUP = "11111111-1111-4111-8111-111111111111";

const items = [
  {
    id: "c1",
    name: "Иван Петров",
    about: "Инженер",
    howWeMet: "Корты в парке",
    status: { kind: "overdue" as const },
    groups: [{ id: GROUP, name: "Теннис" }],
  },
  { id: "c2", name: "Ольга Егорова", about: null, howWeMet: null, status: null, groups: [] },
];

function render(props: Partial<Parameters<typeof ContactList>[0]>) {
  return renderToStaticMarkup(
    createElement(ContactList, {
      items,
      page: 1,
      pageCount: 1,
      pageHref: (page: number) => `/groups/${GROUP}?page=${page}`,
      empty: createElement("p", null, "пусто"),
      ...props,
    }),
  );
}

describe("ContactList", () => {
  it("renders a row per contact, each name links to the card", () => {
    const html = render({});
    const links = [...html.matchAll(/<a[^>]*href="(\/contacts\/[^"]*)"[^>]*>([^<]*)/g)].map(([, href, text]) => [
      href,
      text,
    ]);
    expect(links).toEqual([
      ["/contacts/c1", "Иван Петров"],
      ["/contacts/c2", "Ольга Егорова"],
    ]);
    expect(html).toContain(", пора связаться");
    expect(html).toContain("Теннис");
  });

  it("shows the empty state instead of the list", () => {
    const html = render({ items: [] });
    expect(html).toContain("<p>пусто</p>");
    expect(html).not.toContain("<ul");
  });

  it("has no pages for a single page", () => {
    expect(render({})).not.toContain('aria-label="Страницы"');
  });

  it("builds page links with the given address («Страницы в группе»)", () => {
    const html = render({ page: 2, pageCount: 3 });
    const arrowHref = (label: string) =>
      [...html.matchAll(/<a([^>]*)>/g)]
        .map(([, attrs]) => attrs)
        .find((attrs) => attrs.includes(`aria-label="${label}"`))
        ?.match(/href="([^"]*)"/)?.[1];
    expect(arrowHref("Назад")).toBe(`/groups/${GROUP}?page=1`);
    expect(arrowHref("Вперёд")).toBe(`/groups/${GROUP}?page=3`);
  });

  it("keeps the arrow inactive on the last page", () => {
    const html = render({ page: 3, pageCount: 3 });
    expect(html).toMatch(/<span[^>]*aria-disabled="true"[^>]*aria-label="Вперёд"/);
  });
});
