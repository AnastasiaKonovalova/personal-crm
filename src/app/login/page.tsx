import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginPanel } from "@/components/login-form";
import { LoginShell } from "@/components/login-shell";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Вход — Свои люди",
};

// The only page open without a session (with /login/expired and /health); a signed-in person goes to the list
export default async function LoginPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }

  return (
    <LoginShell>
      <LoginPanel />
    </LoginShell>
  );
}
