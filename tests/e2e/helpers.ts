import { expect } from "vitest";
import { baseUrl, formBody, signIn } from "./auth";

// Shared by the e2e tests: HTTP against a running app, forms sent the way a browser without
// JavaScript does it, and a direct database connection for counts, setup and cleanup.

export { baseUrl, decodeHtml, withPool } from "./auth";

export function visibleText(html: string) {
  return html.replace(/<[^>]+>/g, "");
}

type RequestOptions = {
  // The Cookie header of a session (`signIn()`); without it the request is from someone not signed in
  cookie?: string;
};

// Every request is a fresh client without cache, like opening the page in another browser
export async function getPage(path: string, { cookie }: RequestOptions = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });
  expect(response.status, `GET ${path}`).toBe(200);
  return response.text();
}

// Submits a POST form of the page the way a browser without JavaScript does: the hidden inputs
// (including the server action id) plus `fields`. A page may hold several forms: `formIncludes`
// picks the one whose markup contains that text (e.g. `name="contactId" value="…"`), by default the first
// form of the page itself, not «Выйти» in the header (see formBody in ./auth).
export async function submitForm(
  path: string,
  fields: Record<string, string>,
  { formIncludes, cookie }: RequestOptions & { formIncludes?: string } = {},
) {
  const body = formBody(await getPage(path, { cookie }), fields, formIncludes);
  expect(
    body,
    `POST form on ${path}${formIncludes ? ` containing ${formIncludes}` : ""}`,
  ).toBeDefined();

  return fetch(new URL(path, baseUrl), {
    method: "POST",
    body,
    redirect: "manual",
    headers: { Origin: new URL(baseUrl).origin, ...(cookie ? { cookie } : {}) },
    signal: AbortSignal.timeout(10_000),
  });
}

// A new signed-in user with `getPage` and `submitForm` bound to the session
export async function signInClient(label?: string) {
  const user = await signIn(label);
  return {
    ...user,
    getPage: (path: string) => getPage(path, { cookie: user.cookie }),
    submitForm: (path: string, fields: Record<string, string>, formIncludes?: string) =>
      submitForm(path, fields, { formIncludes, cookie: user.cookie }),
  };
}
