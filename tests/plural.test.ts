import { describe, expect, it } from "vitest";
import { pluralContacts } from "@/lib/plural";

describe("pluralContacts", () => {
  it.each([
    [0, "0 контактов"],
    [1, "1 контакт"],
    [2, "2 контакта"],
    [4, "4 контакта"],
    [5, "5 контактов"],
    [11, "11 контактов"],
    [12, "12 контактов"],
    [14, "14 контактов"],
    [21, "21 контакт"],
    [24, "24 контакта"],
    [111, "111 контактов"],
    [122, "122 контакта"],
  ])("%i → %s", (count, expected) => {
    expect(pluralContacts(count)).toBe(expected);
  });
});
