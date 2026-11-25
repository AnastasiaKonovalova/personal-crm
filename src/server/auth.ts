import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { type SQL, and, count, desc, eq, gt, like, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, loginEmails, sessions, users, verifications } from "@/db/schema";
import { EMAIL_ERROR, loginEmailSchema } from "@/lib/validation";
import { LOGIN_LINK_MINUTES, sendLoginEmail } from "@/server/mail";

// Sign-in by a link from an email (Better Auth, magic-link plugin). Decisions: openspec/changes/archive/2026-11-20-login/design.md.
// Better Auth reads BETTER_AUTH_SECRET and BETTER_AUTH_URL from the environment itself.

// Codes of the errors the sign-in endpoint answers with; the login form turns them into texts
export const LOGIN_ERROR = {
  invalidEmail: "INVALID_EMAIL",
  tooManyEmails: "TOO_MANY_LOGIN_EMAILS",
} as const;
export const TOO_MANY_EMAILS_ERROR = "Слишком часто, попробуй через несколько минут";

// At most 3 sign-in emails per address in 10 minutes
const EMAIL_LIMIT = 3;
const EMAIL_LIMIT_WINDOW_MINUTES = 10;
// At most 10 sign-in emails from one IP an hour, to any addresses (openspec/changes/email-ip-limit/design.md)
const IP_LIMIT = 10;
const IP_LIMIT_WINDOW_MINUTES = 60;

// Where Better Auth sends the person after the link: the app, or the «Ссылка устарела» screen
const AFTER_SIGN_IN_URL = "/";
const EXPIRED_LINK_URL = "/login/expired";

const SESSION_DAYS = 30;
const DAY_SECONDS = 24 * 60 * 60;

// The client's IP: only X-Real-IP, which nginx overwrites with $remote_addr. X-Forwarded-For is not read: nginx
// appends to what the client sent, so its first value is the client's own. No header (no nginx in front:
// locally, e2e; on the server the app port is open only on localhost) means no IP and no IP limit
function clientIp(headers: Headers | undefined) {
  const ip = headers?.get("x-real-ip")?.trim();
  return ip ? ip : null;
}

// Takes a place in both limits for one email from one IP; false when the IP or the address has used them all.
// The counts and the new row are one transaction under locks on the address and then on the IP, always in
// this order (so no two requests wait for each other): requests that come at once wait here one by one, and
// each sees the places taken before it. The two-key locks keep an address and an IP with the same hash apart
async function takeEmailPlace(email: string, ip: string | null) {
  return getDb().transaction(async (tx) => {
    const sentSince = async (match: SQL, minutes: number) => {
      const [{ sent }] = await tx
        .select({ sent: count() })
        .from(loginEmails)
        .where(
          and(
            match,
            gt(loginEmails.sentAt, sql`now() - ${sql.raw(`interval '${minutes} minutes'`)}`),
          ),
        );
      return sent;
    };

    await tx.execute(sql`select pg_advisory_xact_lock(1, hashtext(${email}))`);
    if (ip !== null) {
      await tx.execute(sql`select pg_advisory_xact_lock(2, hashtext(${ip}))`);
      if ((await sentSince(eq(loginEmails.ip, ip), IP_LIMIT_WINDOW_MINUTES)) >= IP_LIMIT)
        return false;
    }
    if (
      (await sentSince(eq(loginEmails.email, email), EMAIL_LIMIT_WINDOW_MINUTES)) >= EMAIL_LIMIT
    ) {
      return false;
    }
    await tx.insert(loginEmails).values({ email, ip });
    return true;
  });
}

// The email did not go out: the limits count sent emails only, so the latest row of the address is removed,
// and with it the place in the limit of its IP
async function giveEmailPlaceBack(email: string) {
  const db = getDb();
  await db
    .delete(loginEmails)
    .where(
      eq(
        loginEmails.id,
        db
          .select({ id: loginEmails.id })
          .from(loginEmails)
          .where(eq(loginEmails.email, email))
          .orderBy(desc(loginEmails.sentAt))
          .limit(1),
      ),
    );
}

// Runs for the form and for a direct request to /api/auth/sign-in/magic-link alike. It normalizes the
// email, checks it with the same rule as the form, applies both limits and fixes where the link leads:
// everything else the request carries (name, other redirects, metadata) is dropped
const beforeSignInRequest = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-in/magic-link") return;

  const body: unknown = ctx.body;
  const asked =
    typeof body === "object" && body !== null && "email" in body ? body.email : undefined;
  const parsed = loginEmailSchema.safeParse({ email: asked });
  if (!parsed.success) {
    throw new APIError("BAD_REQUEST", { message: EMAIL_ERROR, code: LOGIN_ERROR.invalidEmail });
  }
  const { email } = parsed.data;

  if (!(await takeEmailPlace(email, clientIp(ctx.headers)))) {
    throw new APIError("TOO_MANY_REQUESTS", {
      message: TOO_MANY_EMAILS_ERROR,
      code: LOGIN_ERROR.tooManyEmails,
    });
  }

  return {
    context: {
      body: { email, callbackURL: AFTER_SIGN_IN_URL, errorCallbackURL: EXPIRED_LINK_URL },
    },
  };
});

// Better Auth has created the link and calls this to deliver it. A new link kills the older ones of the
// same address: they are the other `verifications` rows with the same value (the token is stored as is,
// identifier = "magic-link:<token>", value = {"type":"magic-link","email":"<email>"}; design.md, decision 4).
// Then the email goes out: its place in the limit was taken before the link was made (beforeSignInRequest)
// and is given back if the send fails. Rows older than a day are no longer needed
async function sendSignInLink({
  email,
  url,
  token,
}: {
  email: string;
  url: string;
  token: string;
}) {
  const db = getDb();
  await db
    .delete(verifications)
    .where(
      and(
        like(verifications.identifier, "magic-link:%"),
        ne(verifications.identifier, `magic-link:${token}`),
        eq(verifications.value, JSON.stringify({ type: "magic-link", email })),
      ),
    );

  try {
    await sendLoginEmail(email, url);
  } catch (error) {
    await giveEmailPlaceBack(email);
    throw error;
  }

  await db.delete(loginEmails).where(lt(loginEmails.sentAt, sql`now() - interval '1 day'`));
}

// Better Auth's own per-IP limit (on by default only in production) stays as Better Auth sets it. Only e2e
// against a production build turns it off: all their requests come from one address (design.md, decision 2а)
function ipRateLimit() {
  return process.env.E2E_AUTH_IP_LIMIT === "off" ? { enabled: false } : undefined;
}

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      // Our tables are plural: users, sessions, accounts, verifications
      usePlural: true,
      schema: { users, sessions, accounts, verifications },
    }),
    // 30 days since the last visit: the term is extended at most once a day, so it is exact to a day.
    // No cookie cache: signing out and expiry take effect at once
    session: { expiresIn: SESSION_DAYS * DAY_SECONDS, updateAge: DAY_SECONDS },
    hooks: { before: beforeSignInRequest },
    rateLimit: ipRateLimit(),
    plugins: [
      magicLink({
        expiresIn: LOGIN_LINK_MINUTES * 60,
        // The first sign-in creates the user: there is no separate sign-up
        disableSignUp: false,
        sendMagicLink: sendSignInLink,
      }),
      // Sets the session cookie from server actions; must be the last plugin
      nextCookies(),
    ],
  });
}

// Created on the first call, not on import: betterAuth() reads the secret at once and the production build
// imports this module without any settings
let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  auth ??= createAuth();
  return auth;
}
