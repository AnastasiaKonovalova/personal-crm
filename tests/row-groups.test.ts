import { describe, expect, it } from "vitest";
import { layoutRowGroups } from "@/lib/row-groups";

const names = (count: number) => ["Альфа", "Бета", "Гамма", "Дельта", "Эпсилон"].slice(0, count);

describe("layoutRowGroups", () => {
  it("wide screen, five groups: three first and +2 (scenario «Широкий экран, пять групп»)", () => {
    const { wide } = layoutRowGroups(names(5));
    expect(wide.visible).toEqual(["Альфа", "Бета", "Гамма"]);
    expect(wide.more).toEqual({ count: 2, hidden: ["Дельта", "Эпсилон"] });
  });

  it("medium screen, five groups: two first and +3 (scenario «Средний экран, пять групп»)", () => {
    const { medium } = layoutRowGroups(names(5));
    expect(medium.visible).toEqual(["Альфа", "Бета"]);
    expect(medium.more).toEqual({ count: 3, hidden: ["Гамма", "Дельта", "Эпсилон"] });
  });

  it("narrow screen, three groups: one first and +2 (scenario «Узкий экран, три группы»)", () => {
    const { narrow } = layoutRowGroups(names(3));
    expect(narrow.visible).toEqual(["Альфа"]);
    expect(narrow.more).toEqual({ count: 2, hidden: ["Бета", "Гамма"] });
  });

  it("no badge when the groups fit (scenario «Групп не больше, чем помещается»)", () => {
    const layout = layoutRowGroups(names(2));
    expect(layout.wide).toEqual({ visible: ["Альфа", "Бета"], more: null });
    expect(layout.medium).toEqual({ visible: ["Альфа", "Бета"], more: null });
    expect(layout.narrow.more).toEqual({ count: 1, hidden: ["Бета"] });
  });

  it("nothing for a contact without groups (scenario «Без групп»)", () => {
    const layout = layoutRowGroups([]);
    expect(layout.rendered).toEqual([]);
    for (const width of [layout.wide, layout.medium, layout.narrow]) {
      expect(width).toEqual({ visible: [], more: null });
    }
  });

  it("renders at most three groups: CSS hides the rest per width", () => {
    expect(layoutRowGroups(names(5)).rendered).toEqual(["Альфа", "Бета", "Гамма"]);
    expect(layoutRowGroups(names(1)).rendered).toEqual(["Альфа"]);
  });

  it("works with group objects and keeps the given order", () => {
    const groups = [
      { id: "1", name: "Друзья" },
      { id: "2", name: "Теннис" },
    ];
    expect(layoutRowGroups(groups).narrow).toEqual({ visible: [groups[0]], more: { count: 1, hidden: [groups[1]] } });
  });
});
