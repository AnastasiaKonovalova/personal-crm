import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DueDot, DueDotLabel } from "@/components/due-dot";

// The status dot of the contact list: "просрочено" and "скоро" look different and say different
// things to a screen reader; a contact that is fine or has no cadence gets an empty slot

type Kind = "overdue" | "soon" | "ok" | null;

const dot = (kind: Kind) => renderToStaticMarkup(createElement(DueDot, { kind }));
const label = (kind: Kind) => renderToStaticMarkup(createElement(DueDotLabel, { kind }));

describe("DueDot", () => {
  it("draws overdue and soon differently, both pulsing", () => {
    expect(dot("overdue")).not.toBe(dot("soon"));
    expect(dot("overdue")).toContain("animate-due-overdue");
    expect(dot("soon")).toContain("animate-due-soon");
  });

  it("keeps an empty slot without a pulse for a contact that is fine or has no cadence", () => {
    for (const kind of ["ok", null] as const) {
      expect(dot(kind)).toContain('aria-hidden="true"');
      expect(dot(kind)).not.toContain("animate-due");
    }
  });
});

describe("DueDotLabel", () => {
  it("tells a screen reader what the dot means", () => {
    expect(label("overdue")).toBe('<span class="sr-only">, пора связаться</span>');
    expect(label("soon")).toBe('<span class="sr-only">, скоро пора связаться</span>');
  });

  it("says nothing for a contact that is fine or has no cadence", () => {
    expect(label("ok")).toBe("");
    expect(label(null)).toBe("");
  });
});
