import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactForm } from "@/components/contact-form";
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
    <div className="grid max-w-xl gap-6">
      <h1 className="text-2xl font-semibold">Редактирование контакта</h1>
      <ContactForm contact={contact} />
    </div>
  );
}
