import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { and, count, eq, gt, like, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, loginEmails, sessions, users, verifications } from "@/db/schema";
import { EMAIL_ERROR, loginEmailSchema } from "@/lib/validation";
import { LOGIN_LINK_MINUTES, sendLoginEmail } from "@/server/mail";

// Sign-in by a link from an email (Better Auth, magic-link plugin). Decisions: openspec/changes/login/design.md.
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

// Where Better Auth sends the person after the link: the app, or the «Ссылка устарела» screen
const AFTER_SIGN_IN_URL = "/";
const EXPIRED_LINK_URL = "/login/expired";

const SESSION_DAYS = 30;
const DAY_SECONDS = 24 * 60 * 60;

async function tooManyEmails(email: string) {
  const [{ sent }] = await getDb()
    .select({ sent: count() })
    .from(loginEmails)
    .where(
      and(
        eq(loginEmails.email, email),
        gt(
          loginEmails.sentAt,
          sql`now() - ${sql.raw(`interval '${EMAIL_LIMIT_WINDOW_MINUTES} minutes'`)}`,
        ),
      ),
    );
  return sent >= EMAIL_LIMIT;
}

// Runs for the form and for a direct request to /api/auth/sign-in/magic-link alike. It normalizes the
// email, checks it with the same rule as the form, applies the limit and fixes where the link leads:
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

  if (await tooManyEmails(email)) {
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
// Then the email goes out and counts toward the limit; rows older than a day are no longer needed
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

  await sendLoginEmail(email, url);

  await db.insert(loginEmails).values({ email });
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
