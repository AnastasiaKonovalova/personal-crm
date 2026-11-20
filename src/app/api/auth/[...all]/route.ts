import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

// The Better Auth endpoints. The link from the sign-in email opens /api/auth/magic-link/verify.
// getAuth() runs per request, not on import, so the production build needs no settings.
export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));
