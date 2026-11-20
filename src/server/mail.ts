import nodemailer, { type Transporter } from "nodemailer";

// Outgoing mail. The same code runs everywhere; where the mail goes is decided by the environment:
// Mailpit locally and in CI, Resend (SMTP) on the server. The transport is built on the first send,
// not on import, so the production build needs no mail settings. The recipient's address is never logged.

// How long a sign-in link works; the same number goes to Better Auth's expiresIn (src/server/auth.ts)
export const LOGIN_LINK_MINUTES = 15;

const SUBJECT = "Ссылка для входа в «Свои люди»";
const IGNORE_PHRASE = "Если вход запрашивал(а) не ты - просто проигнорируй письмо";

function setting(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

let transport: Transporter | undefined;

function getTransport() {
  if (!transport) {
    const port = Number(setting("SMTP_PORT"));
    if (!Number.isInteger(port)) {
      throw new Error("SMTP_PORT is not a number");
    }
    const user = process.env.SMTP_USER;
    transport = nodemailer.createTransport({
      host: setting("SMTP_HOST"),
      port,
      secure: process.env.SMTP_SECURE === "true",
      // Mailpit takes mail without a login
      auth: user ? { user, pass: process.env.SMTP_PASSWORD } : undefined,
    });
  }
  return transport;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

function loginEmailText(url: string) {
  return [
    "Чтобы войти в «Свои люди», открой ссылку:",
    url,
    `Ссылка работает ${LOGIN_LINK_MINUTES} минут и только один раз.`,
    `${IGNORE_PHRASE}.`,
  ].join("\n\n");
}

// Mail clients do not read CSS variables, so the colours are the values of the design tokens
// (src/design-system/tokens.css): --bg, --surface, --line, --ink, --muted, --accent
function loginEmailHtml(url: string) {
  return `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:24px;background:#f4f0e7;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#504636;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#fbf8f1;border:1px solid #e0d9c8;border-radius:20px;">
<tr><td style="padding:30px;">
<p style="margin:0 0 24px;font-size:18px;line-height:1.4;">Чтобы войти в «Свои люди», нажми кнопку.</p>
<p style="margin:0 0 24px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 28px;background:#f1b559;color:#504636;text-decoration:none;font-weight:700;border-radius:100px;">Войти</a></p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#6e665a;">Ссылка работает ${LOGIN_LINK_MINUTES} минут и только один раз.</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#6e665a;">${IGNORE_PHRASE}.</p>
</td></tr>
</table>
</body>
</html>`;
}

// `to` is the normalized address of the person who asked for the link. A failed send is logged with the
// error code only and rethrown without the cause: transport errors can carry the address
export async function sendLoginEmail(to: string, url: string) {
  const from = setting("MAIL_FROM");
  const mail = getTransport();
  try {
    await mail.sendMail({
      from,
      to,
      subject: SUBJECT,
      text: loginEmailText(url),
      html: loginEmailHtml(url),
    });
  } catch (error) {
    const { code, responseCode } = error as { code?: unknown; responseCode?: unknown };
    console.error("Sending the sign-in email failed", { code, responseCode });
    throw new Error("Failed to send the sign-in email");
  }
}
