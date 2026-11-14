import { describe, expect, it } from "vitest";
import { newContactReturnHref } from "@/lib/contact-form-return";

describe("newContactReturnHref", () => {
  it("opened from a group page: back to that group page", () => {
    expect(newContactReturnHref({ id: "3f1c2b9e-7a4d-4e8f-9b2a-1c5d6e7f8a90" })).toBe(
      "/groups/3f1c2b9e-7a4d-4e8f-9b2a-1c5d6e7f8a90",
    );
  });

  it("opened from the main page, or the group is gone: back to the main page", () => {
    expect(newContactReturnHref(null)).toBe("/");
    expect(newContactReturnHref(undefined)).toBe("/");
  });
});
