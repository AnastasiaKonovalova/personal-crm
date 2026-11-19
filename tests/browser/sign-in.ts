import { expect, type BrowserContext, type Page } from "@playwright/test";
import { baseUrl, emailCount, loginLinks, userIdOf } from "../e2e/auth";

// Sign-in for the browser tests. `signInInBrowser` goes the real way: the /login form, the link from
// Mailpit, the app with the email in the header. `useSession` puts the cookie of a user signed in over HTTP
// (`signIn()` from tests/e2e/auth.ts) into a browser context, for tests about something other than sign-in.

// Signs the page in as this email (the user is created on the first sign-in); returns the user id
export async function signInInBrowser(page: Page, email: string) {
  const sentBefore = await emailCount(email);
  await page.goto("/login");
  await page.getByLabel("Почта").fill(email);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await expect(page.getByText(`Ссылка для входа отправлена на ${email}`)).toBeVisible();

  const [link] = await loginLinks(email, sentBefore + 1);
  await page.goto(link);
  await expect(page).toHaveURL(new URL("/", baseUrl).toString());
  await expect(page.getByRole("banner").getByText(email)).toBeVisible();
  return userIdOf(email);
}

// The Cookie header ("name=value; …") as cookies of the context, for the app under test
export async function useSession(context: BrowserContext, cookie: string) {
  await context.addCookies(
    cookie.split("; ").map((pair) => {
      const separator = pair.indexOf("=");
      return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl };
    }),
  );
}
