import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/server/auth";

// Renews the session cookie on a visit (openspec/changes/archive/2026-11-20-login/design.md, decision 6а). Pages read the
// session in server components, where Next does not let Better Auth set cookies: the term grows in the
// database, but the browser would drop the cookie 30 days after signing in. Here cookies can be set, so
// the session is read once more and its Set-Cookie (renewed at most once a day, or removed when the
// session is over) goes to the response. Access is NOT checked here: requireUser() does it in every page
// and action (decision 6)
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  if (!getSessionCookie(request)) return response;

  try {
    const { headers } = await getAuth().api.getSession({
      headers: request.headers,
      returnHeaders: true,
    });
    for (const cookie of headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }
  } catch (error) {
    // The page reads the session itself and fails or leads to /login on its own: only the renewal is lost
    console.error("Session renewal in proxy failed", error);
  }
  return response;
}

export const config = {
  // Pages and the server actions posted to them; not /api (Better Auth sets its cookies itself), not
  // /health, not Next internals and not files (any path with a dot: favicon, icons)
  matcher: ["/((?!api/|_next/|health$|.*\\.).*)"],
};
