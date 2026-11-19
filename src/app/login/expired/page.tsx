import type { Metadata } from "next";
import Link from "next/link";
import { LoginShell } from "@/components/login-shell";
import { Button } from "@/components/ui/button";
import { LOGIN_LINK_MINUTES } from "@/server/mail";

export const metadata: Metadata = {
  title: "Ссылка устарела — Свои люди",
};

// Better Auth sends here every link that does not let in: old, used, replaced or unknown (design.md, decision 4).
// An empty-state card like the list's (decision 35), centered as the whole sign-in column
export default function ExpiredLinkPage() {
  return (
    <LoginShell>
      <div className="rounded-contact border border-line bg-surface bg-[radial-gradient(circle_at_85%_0,var(--accent-soft),transparent_55%)] px-[clamp(24px,4vw,48px)] py-[clamp(36px,5vw,64px)]">
        <h1 className="mx-auto max-w-[22ch] font-display text-empty-title font-semibold text-balance">
          Ссылка устарела, запроси новую
        </h1>
        <p className="mx-auto mt-3.5 max-w-[44ch] text-muted-foreground">
          {`Ссылка работает ${LOGIN_LINK_MINUTES} минут и только один раз.`}
        </p>
        <div className="mt-heading flex justify-center">
          <Button asChild>
            <Link href="/login">Запросить новую ссылку</Link>
          </Button>
        </div>
      </div>
    </LoginShell>
  );
}
