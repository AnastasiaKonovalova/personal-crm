import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = {
  title: "Новый контакт — Личная CRM",
};

export default function NewContactPage() {
  return (
    <div className="grid max-w-xl gap-6">
      <h1 className="text-2xl font-semibold">Новый контакт</h1>
      <ContactForm />
    </div>
  );
}
