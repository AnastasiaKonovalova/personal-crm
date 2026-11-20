"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAPIError } from "better-auth/api";
import { EMAIL_ERROR, loginEmailSchema } from "@/lib/validation";
import { LOGIN_ERROR, TOO_MANY_EMAILS_ERROR, getAuth } from "@/server/auth";

// «Получить ссылку». The email is checked here for the form and again in the Better Auth hook, which
// also applies the limit (src/server/auth.ts). Works without JavaScript: the page renders the returned state
export type LoginFormState = {
  // What was typed, back in the field on an error
  email?: string;
  error?: string;
  // The address itself is wrong (red field); the limit message leaves the field as it is
  invalid?: boolean;
  // Normalized address the link went to
  sentTo?: string;
};

export async function requestLoginLinkAction(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const value = formData.get("email");
  const email = typeof value === "string" ? value : "";
  const parsed = loginEmailSchema.safeParse({ email });
  if (!parsed.success) {
    return { email, error: EMAIL_ERROR, invalid: true };
  }

  try {
    await getAuth().api.signInMagicLink({
      body: { email: parsed.data.email, callbackURL: "/", errorCallbackURL: "/login/expired" },
      headers: await headers(),
    });
  } catch (error) {
    const code = isAPIError(error) ? error.body?.code : undefined;
    if (code === LOGIN_ERROR.tooManyEmails) {
      return { email, error: TOO_MANY_EMAILS_ERROR };
    }
    if (code === LOGIN_ERROR.invalidEmail) {
      return { email, error: EMAIL_ERROR, invalid: true };
    }
    throw error;
  }

  return { sentTo: parsed.data.email };
}

// «Выйти» in the header. Ends only the session of this device (its cookie); other devices stay signed in.
// Without a session Better Auth just clears the cookie, so a stale tab also lands on /login
export async function signOutAction() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}
