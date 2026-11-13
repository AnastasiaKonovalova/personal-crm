import Form from "next/form";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ContactList } from "@/components/contact-list";
import { ContactsSearch } from "@/components/contacts-search";
import { DeletedToast } from "@/components/deleted-toast";
import { EmptyList } from "@/components/empty-list";
import { PageShell } from "@/components/page-shell";
import { RemindersBlock } from "@/components/reminders-block";
import { SectionSwitch } from "@/components/section-switch";
import { Button } from "@/components/ui/button";
import { contactsHref, listCaption } from "@/lib/contact-list";
import { CADENCE_LABELS, dueText, toDateString } from "@/lib/keep-in-touch";
import { listContacts, listReminders } from "@/server/contacts";
import { listGroups } from "@/server/groups";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const requestedPage = typeof params.page === "string" ? Number(params.page) : 1;
  const requestedGroup = typeof params.group === "string" ? params.group : undefined;

  // A malformed or deleted group comes back as null: the list is shown without the filter
  const [{ items, total, page, pageCount, group }, groups] = await Promise.all([
    listContacts({ query, page: requestedPage, groupId: requestedGroup }),
    listGroups(),
  ]);
  const groupId = group?.id;

  // The "Пора связаться" block is for the first page of the list: not in search, not on page 2+,
  // and not when there are no contacts at all (in the filtered group, with a filter)
  const reminders = !query && page === 1 && total > 0 ? await listReminders({ groupId }) : null;
  const today = toDateString(new Date());
  const reminderRows = (reminders?.items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.status.kind === "overdue" ? ("overdue" as const) : ("soon" as const),
    text: dueText(item.status, item.dueOn, today),
    cadenceLabel: CADENCE_LABELS[item.cadence].toLowerCase(),
  }));

  return (
    <PageShell aurora className="grid gap-heading">
      <div className="flex flex-wrap items-end justify-between gap-grid">
        <div>
          <p
            className="mb-3.5 inline-flex items-center gap-3 font-display text-eyebrow text-muted-foreground uppercase before:h-0.5 before:w-rule-label before:rounded-pill before:bg-teal before:content-['']"
            data-testid="contacts-total"
          >
            {listCaption({ total, query, filtered: Boolean(group) })}
          </p>
          <h1 className="font-display text-page-title font-semibold">Контакты</h1>
        </div>
        <Button asChild>
          <Link href="/contacts/new">
            <Plus />
            Добавить контакт
          </Link>
        </Button>
      </div>

      <SectionSwitch current="contacts" />

      {reminders &&<RemindersBlock rows={reminderRows} hasCadence={reminders.withCadenceCount > 0} />}

      {/* keyed by the address: after «Сбросить» or Back the fields show the new state, not the typed text */}
      <Form key={`${query}|${groupId ?? ""}`} action="/" className="grid gap-cta" role="search">
        <ContactsSearch query={query} groupId={groupId} groups={groups} />
      </Form>

      <ContactList
        items={items}
        page={page}
        pageCount={pageCount}
        pageHref={(target) => contactsHref({ query, groupId, page: target })}
        empty={<EmptyList query={query} inGroup={Boolean(group)} />}
      />

      {/* fixed to the viewport, so it takes no grid cell */}
      {params.deleted === "1" && <DeletedToast />}
    </PageShell>
  );
}
