import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "Новый контакт — Личная CRM",
};

export default function NewContactPage() {
  return (
    <PageShell width="narrow" className="grid gap-heading">
      <BackLink href="/">Все контакты</BackLink>
      <h1 className="font-display text-page-title font-semibold">Новый контакт</h1>
      <ContactForm />
    </PageShell>
  );
}
