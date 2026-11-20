import { afterEach, describe, expect, it, vi } from "vitest";

// Better Auth's own per-IP limit (5 requests a minute on /sign-in/magic-link and /magic-link/verify, on by
// default only in production) stays as Better Auth sets it. Only e2e against a production build (CI,
// scripts/checks.sh) turns it off with E2E_AUTH_IP_LIMIT=off: all their requests come from one address
// (design.md, decision 2а). Our limit of 3 emails per address does not depend on it.

const SETTING = "E2E_AUTH_IP_LIMIT";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function rateLimitOption(value: string | undefined) {
  vi.stubEnv(SETTING, value);
  vi.resetModules();
  const { getAuth } = await import("@/server/auth");
  return getAuth().options.rateLimit;
}

describe("Better Auth's per-IP limit", () => {
  it("is left to Better Auth's default without the setting", async () => {
    expect(await rateLimitOption(undefined)).toBeUndefined();
  });

  it("is turned off with E2E_AUTH_IP_LIMIT=off", async () => {
    expect(await rateLimitOption("off")).toEqual({ enabled: false });
  });

  it("is left to the default for any other value", async () => {
    for (const value of ["", "on", "false", "OFF", "0"]) {
      expect(await rateLimitOption(value), value).toBeUndefined();
    }
  });
});
