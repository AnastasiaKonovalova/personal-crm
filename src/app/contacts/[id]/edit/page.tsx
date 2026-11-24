import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { PageShell } from "@/components/page-shell";
import { getContactWithNotes } from "@/server/contacts";
import { listGroups } from "@/server/groups";
import { requireUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Редактирование контакта — Свои люди",
};

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [data, groups] = await Promise.all([getContactWithNotes(user.id, id), listGroups(user.id)]);
  if (!data) {
    notFound();
  }
  const { contact } = data;

  return (
    <PageShell width="narrow" className="grid gap-heading">
      <BackLink href={`/contacts/${contact.id}`}>{contact.name}</BackLink>
      <h1 className="font-display text-page-title font-semibold">Редактирование контакта</h1>
      <ContactForm
        // The form holds strings, as the browser sends them
        contact={{
          ...contact,
          birthDay: contact.birthDay?.toString() ?? null,
          birthMonth: contact.birthMonth?.toString() ?? null,
          birthYear: contact.birthYear?.toString() ?? null,
        }}
        groups={groups.map(({ id: groupId, name }) => ({ id: groupId, name }))}
        groupIds={data.groups.map((group) => group.id)}
        cancelHref={`/contacts/${contact.id}`}
      />
    </PageShell>
  );
}
