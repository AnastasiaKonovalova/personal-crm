import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeaderAccount } from "@/components/header-account";

// Header after sign-in (mockups header-account*.html, decision 36): the email and «Выйти» as a form.
// Signing out itself is covered by the e2e tests «Выход» and «Выход на одном устройстве»

function render(email: string) {
  return renderToStaticMarkup(createElement(HeaderAccount, { email }));
}

describe("HeaderAccount", () => {
  it("shows the email with the full address in title", () => {
    const html = render("anna@example.com");
    expect(html).toMatch(/<span[^>]*title="anna@example.com"[^>]*>anna@example.com<\/span>/);
  });

  it("keeps a long email whole in the markup: the cut is CSS only", () => {
    const email = `${"a".repeat(58)}@example.com`;
    const html = render(email);
    expect(html).toContain(`title="${email}"`);
    expect(html).toContain(`>${email}</span>`);
  });

  // The no-JS POST (method and hidden action fields) is added by Next, not by plain React: checked in the browser
  it("signs out with a form submit button named «Выйти»", () => {
    const html = render("anna@example.com");
    const form = html.match(/<form[^>]*>[\s\S]*<\/form>/)?.[0] ?? "";
    expect(form).toMatch(/<button[^>]*type="submit"[^>]*aria-label="Выйти"/);
    expect(form).toContain("Выйти</span>");
  });
});
