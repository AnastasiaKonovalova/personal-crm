import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { ContactForm } from "@/components/contact-form";
import { PageShell } from "@/components/page-shell";
import { newContactReturnHref } from "@/lib/contact-form-return";
import { findGroup, listGroups } from "@/server/groups";

export const metadata: Metadata = {
  title: "Новый контакт — Личная CRM",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// «Добавить контакт» on a group page opens /contacts/new?group=<id>: that group is ticked.
// A malformed id or a deleted group is ignored, the form opens with nothing ticked
export default async function NewContactPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [groups, preselected] = await Promise.all([
    listGroups(),
    findGroup(typeof params.group === "string" ? params.group : undefined),
  ]);

  const returnHref = newContactReturnHref(preselected);

  return (
    <PageShell width="narrow" className="grid gap-heading">
      <BackLink href={returnHref}>Все контакты</BackLink>
      <h1 className="font-display text-page-title font-semibold">Новый контакт</h1>
      <ContactForm
        groups={groups.map(({ id, name }) => ({ id, name }))}
        groupIds={preselected ? [preselected.id] : []}
        cancelHref={returnHref}
      />
    </PageShell>
  );
}
