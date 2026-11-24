import { describe, expect, it } from "vitest";
import { blockReturnTo } from "@/lib/block-return";

// Where «Поздравил(а)» without JavaScript sends the browser back to (design.md decision 9): only the
// pages with the block, anything else - the main page

const GROUP = "3f1c2b9e-7a4d-4e8f-9b2a-1c5d6e7f8a90";

describe("blockReturnTo", () => {
  it("keeps the main page, the main page filtered by a group and the group page", () => {
    expect(blockReturnTo("/")).toBe("/");
    expect(blockReturnTo(`/?group=${GROUP}`)).toBe(`/?group=${GROUP}`);
    expect(blockReturnTo(`/groups/${GROUP}`)).toBe(`/groups/${GROUP}`);
  });

  it.each([
    ["empty", ""],
    ["another site", "https://example.com/"],
    ["a protocol-relative address", "//example.com"],
    ["another page", "/contacts/new"],
    ["a malformed group id", "/groups/not-a-uuid"],
    ["a group page with more after it", `/groups/${GROUP}/edit`],
    ["a filter with other parameters", `/?group=${GROUP}&q=x`],
    ["a filter with a malformed id", "/?group=x"],
  ])("sends %s to the main page", (_label, value) => {
    expect(blockReturnTo(value)).toBe("/");
  });
});
