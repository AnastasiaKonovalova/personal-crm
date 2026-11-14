import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RowGroups } from "@/components/row-groups";

// The server render of the groups cell of a list row: what a visitor sees before (or without) JavaScript

const names = ["Аналитики", "Дача", "Друзья", "Соседи", "Цигун"];

function render(groupNames: string[]) {
  const groups = groupNames.map((name, index) => ({ id: `group-${index}`, name }));
  return renderToStaticMarkup(createElement(RowGroups, { groups }));
}

function chips(html: string) {
  return [...html.matchAll(/<span[^>]*data-group-chip[^>]*>([^<]*)<\/span>/g)].map(
    (match) => match[1],
  );
}

// Each «+N» button with the items of the popover it targets
function badges(html: string) {
  return [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map(([, attrs, text]) => {
    const attr = (name: string) => attrs.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1];
    const target = attr("popovertarget");
    const popover = html.split(`id="${target}"`)[1]?.split("</ul>")[0] ?? "";
    return {
      text,
      label: attr("aria-label"),
      action: attr("popovertargetaction"),
      hidden: [...popover.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((match) => match[1]),
    };
  });
}

describe("RowGroups", () => {
  it("renders the first three groups and one «+N» per layout for five groups", () => {
    const html = render(names);
    expect(chips(html)).toEqual(["Аналитики", "Дача", "Друзья"]);
    expect(badges(html)).toEqual([
      { text: "+2", label: "Ещё 2 группы", action: "show", hidden: ["Соседи", "Цигун"] },
      {
        text: "+4",
        label: "Ещё 4 группы",
        action: "show",
        hidden: ["Дача", "Друзья", "Соседи", "Цигун"],
      },
    ]);
  });

  it("has only the compact «+1» when two groups fit the wide screen", () => {
    const html = render(names.slice(0, 2));
    expect(chips(html)).toEqual(["Аналитики", "Дача"]);
    expect(badges(html)).toEqual([
      { text: "+1", label: "Ещё 1 группа", action: "show", hidden: ["Дача"] },
    ]);
  });

  it("is an empty cell without groups", () => {
    expect(render([])).toMatch(/^<span[^>]*><\/span>$/);
  });

  it("does not make groups links and gives each badge its own popover", () => {
    const html = render(names);
    expect(html).not.toContain("<a");
    const targets = [...html.matchAll(/popovertarget="([^"]*)"/gi)].map((match) => match[1]);
    expect(new Set(targets).size).toBe(2);
    for (const target of targets) expect(html).toMatch(new RegExp(`id="${target}"[^>]*popover=`));
  });

  it("keeps a long group name whole in the markup, the ellipsis is CSS", () => {
    const longName = "Выпускники курса интерьерного дизайна, поток 2019.";
    const html = render([longName]);
    expect(chips(html)).toEqual([longName]);
    expect(html).toContain(`title="${longName}"`);
    expect(html).toMatch(/data-group-chip[^>]*class="[^"]*truncate/);
  });
});
