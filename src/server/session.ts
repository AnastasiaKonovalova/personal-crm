import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/server/auth";

// The signed-in user of the current request, or null. Imported by server components and server actions.
// cache(): the layout (header) and the page both ask, the session is read from the database once per request
export const getCurrentUser = cache(async () => {
  // headers() first: during the production build it stops the prerender of a page as dynamic, before
  // Better Auth is created (it needs the secret, which the build does not have)
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
});

// First line of every page (except /login, /login/expired and /health) and of every server action:
// without a session the person goes to the sign-in page, and nothing below runs
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
