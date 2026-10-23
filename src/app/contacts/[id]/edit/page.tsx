import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactForm } from "@/components/contact-form";
import { PageShell } from "@/components/page-shell";
import { getContact } from "@/server/contacts";

export const metadata: Metadata = {
  title: "Редактирование контакта — Личная CRM",
};

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) {
    notFound();
  }

  return (
    <PageShell width="narrow" className="grid gap-6">
      <h1 className="text-2xl font-semibold">Редактирование контакта</h1>
      <ContactForm contact={contact} />
    </PageShell>
  );
}
