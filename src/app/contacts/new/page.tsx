import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "Новый контакт — Личная CRM",
};

export default function NewContactPage() {
  return (
    <PageShell width="narrow" className="grid gap-6">
      <h1 className="text-2xl font-semibold">Новый контакт</h1>
      <ContactForm />
    </PageShell>
  );
}
