import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { sendLoginEmail } from "@/server/mail";

// Sends real emails to Mailpit (locally `docker compose up -d mailpit`, in CI a service) and reads them
// back through its API. Addresses are fictional and unique to this run; the test removes its own emails.

const MAILPIT = "http://localhost:8025";
const marker = randomUUID().slice(0, 8);
const addressOf = (name: string) => `${name}-${marker}@example.test`;
const sentIds = new Set<string>();

type Message = {
  ID: string;
  From: { Name: string; Address: string };
  To: { Address: string }[];
  Subject: string;
  Text: string;
  HTML: string;
};

// The email for the address, once Mailpit has it
async function emailTo(address: string): Promise<Message> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
    );
    const { messages } = (await response.json()) as { messages?: { ID: string }[] };
    if (messages?.[0]) {
      sentIds.add(messages[0].ID);
      return (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No email to ${address} in Mailpit`);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

afterAll(async () => {
  if (sentIds.size === 0) return;
  await fetch(`${MAILPIT}/api/v1/messages`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ IDs: [...sentIds] }),
  });
});

// The first send opens an SMTP connection, which can take seconds on a cold start: more than the default 5 s
describe("the sign-in email", { timeout: 15_000 }, () => {
  it("has the sender, the subject, the button, the term and the phrase about ignoring (scenario «Содержимое письма»)", async () => {
    const to = addressOf("content");
    // The & in the link must be escaped in the HTML
    const link = `http://localhost:3000/api/auth/magic-link/verify?token=${marker}&callbackURL=%2F`;

    await sendLoginEmail(to, link);

    const email = await emailTo(to);
    expect(email.From.Name).toBe("Свои люди - Личная CRM");
    expect(email.From.Address).toMatch(/^noreply@/);
    expect(email.To.map((item) => item.Address)).toEqual([to]);
    expect(email.Subject).toBe("Ссылка для входа в «Свои люди»");

    // Text version: the link itself, the term, the phrase
    expect(email.Text).toContain(link);
    expect(email.Text).toContain("15 минут");
    expect(email.Text).toContain("Если вход запрашивал(а) не ты - просто проигнорируй письмо");

    // HTML version: the button «Войти» with the link
    expect(email.HTML).toMatch(
      new RegExp(`<a href="${link.replace(/[.?]/g, "\\$&").replace("&", "&amp;")}"[^>]*>Войти</a>`),
    );
    expect(email.HTML).toContain("15 минут");
    expect(email.HTML).toContain("Если вход запрашивал(а) не ты - просто проигнорируй письмо");
  });

  it("logs only an error code and throws without details when the send fails", async () => {
    // Nothing listens on port 1, so the connection is refused
    vi.stubEnv("SMTP_PORT", "1");
    vi.resetModules();
    const { sendLoginEmail: failing } = await import("@/server/mail");
    const to = addressOf("leak");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    const error = await failing(to, "http://localhost:3000/link").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Failed to send the sign-in email");
    expect((error as Error).cause).toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(to);
  });

  it("needs the mail settings only when it sends, so the build runs without them", async () => {
    for (const name of ["SMTP_HOST", "SMTP_PORT", "MAIL_FROM"]) vi.stubEnv(name, "");
    vi.resetModules();

    // Importing is fine; sending names the missing setting
    const { sendLoginEmail: unconfigured } = await import("@/server/mail");
    await expect(unconfigured(addressOf("none"), "http://localhost:3000/link")).rejects.toThrow(
      /^(MAIL_FROM|SMTP_HOST|SMTP_PORT) is not set$/,
    );
  });
});
