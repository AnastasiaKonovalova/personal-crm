import { Pool } from "pg";
import { expect } from "vitest";

// Shared by the e2e tests: HTTP against a running app, forms sent the way a browser without
// JavaScript does it, and a direct database connection for counts, setup and cleanup.

export const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const htmlEntities: Record<string, string> = {
  "&quot;": '"',
  "&amp;": "&",
  "&#x27;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

export function decodeHtml(value: string) {
  return value.replace(/&(?:quot|amp|#x27|#39|lt|gt);/g, (entity) => htmlEntities[entity]);
}

export function visibleText(html: string) {
  return html.replace(/<[^>]+>/g, "");
}

export async function withPool<T>(run: (pool: Pool) => Promise<T>) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

// Every request is a fresh client without cookies or cache, like opening the page in another browser
export async function getPage(path: string) {
  const response = await fetch(new URL(path, baseUrl), { redirect: "manual" });
  expect(response.status, `GET ${path}`).toBe(200);
  return response.text();
}

// Submits a POST form of the page the way a browser without JavaScript does: the hidden inputs
// (including the server action id) plus `fields`. A page may hold several forms: `formIncludes`
// picks the one whose markup contains that text (e.g. `name="contactId" value="…"`), by default the first.
export async function submitForm(path: string, fields: Record<string, string>, formIncludes?: string) {
  const html = await getPage(path);
  const forms = [...html.matchAll(/<form[^>]*method="POST"[^>]*>([\s\S]*?)<\/form>/g)];
  const form = formIncludes ? forms.find((candidate) => candidate[1].includes(formIncludes)) : forms[0];
  expect(form, `POST form on ${path}${formIncludes ? ` containing ${formIncludes}` : ""}`).toBeDefined();

  const body = new FormData();
  for (const [, key, value = ""] of form![1].matchAll(
    /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/?>/g,
  )) {
    body.append(key, decodeHtml(value));
  }
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, value);
  }

  return fetch(new URL(path, baseUrl), {
    method: "POST",
    body,
    redirect: "manual",
    headers: { Origin: new URL(baseUrl).origin },
    signal: AbortSignal.timeout(10_000),
  });
}
