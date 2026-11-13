import { describe, expect, it } from "vitest";
import { groupsToAdd } from "@/lib/card-groups";

const all = [
  { id: "a", name: "Дача" },
  { id: "b", name: "Друзья" },
  { id: "c", name: "Теннис" },
];

describe("groupsToAdd", () => {
  it("suggests only the groups the contact is not in, keeping the order", () => {
    expect(groupsToAdd(all, [{ id: "b" }])).toEqual([
      { id: "a", name: "Дача" },
      { id: "c", name: "Теннис" },
    ]);
  });

  it("contact without groups: all groups", () => {
    expect(groupsToAdd(all, [])).toEqual(all);
  });

  it("contact in every group: nothing to suggest", () => {
    expect(groupsToAdd(all, all)).toEqual([]);
  });
});
