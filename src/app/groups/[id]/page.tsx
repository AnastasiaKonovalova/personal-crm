import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { ContactList } from "@/components/contact-list";
import { SearchRow } from "@/components/contacts-search";
import { EmptyList } from "@/components/empty-list";
import { PageShell } from "@/components/page-shell";
import { RemindersBlock } from "@/components/reminders-block";
import { Button } from "@/components/ui/button";
import { groupPageHref, listCaption } from "@/lib/contact-list";
import { CADENCE_LABELS, dueText, toDateString } from "@/lib/keep-in-touch";
import { listContacts, listReminders } from "@/server/contacts";
import { findGroup } from "@/server/groups";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// The page of one group (design.md п.12): only its contacts, no section switch and no group filter
export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const query = typeof search.q === "string" ? search.q.trim() : "";
  const requestedPage = typeof search.page === "string" ? Number(search.page) : 1;

  // A deleted group or a malformed id: "Не найдено", as for a deleted contact
  const group = await findGroup(id);
  if (!group) {
    notFound();
  }

  const { items, total, page, pageCount } = await listContacts({ query, page: requestedPage, groupId: group.id });

  // The same rules as on the main page: first page, no search, the group has contacts
  const reminders = !query && page === 1 && total > 0 ? await listReminders({ groupId: group.id }) : null;
  const today = toDateString(new Date());
  const reminderRows = (reminders?.items ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.status.kind === "overdue" ? ("overdue" as const) : ("soon" as const),
    text: dueText(item.status, item.dueOn, today),
    cadenceLabel: CADENCE_LABELS[item.cadence].toLowerCase(),
  }));

  const groupHref = groupPageHref({ groupId: group.id });

  return (
    <PageShell aurora className="grid gap-heading">
      <nav aria-label="Назад" className="grid justify-items-start gap-tag">
        <BackLink href="/groups">Все группы</BackLink>
        <BackLink href="/">Все контакты</BackLink>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-grid">
        <div className="min-w-0">
          <p
            className="mb-3.5 inline-flex items-center gap-3 font-display text-eyebrow text-muted-foreground uppercase before:h-0.5 before:w-rule-label before:rounded-pill before:bg-teal before:content-['']"
            data-testid="contacts-total"
          >
            {listCaption({ total, query, filtered: false })}
          </p>
          <h1 className="font-display text-page-title font-semibold">
            Контакты
            <span className="mt-2 block text-status font-semibold [overflow-wrap:anywhere] text-muted-foreground">
              {" в группе "}
              <b className="font-semibold text-ink">{group.name}</b>
            </span>
          </h1>
        </div>
        <Button asChild>
          <Link href={`/contacts/new?group=${group.id}`}>
            <Plus />
            Добавить контакт
          </Link>
        </Button>
      </div>

      {reminders && <RemindersBlock rows={reminderRows} hasCadence={reminders.withCadenceCount > 0} />}

      {/* keyed by the search: after «Сбросить» or Back the field shows the new state, not the typed text */}
      <Form key={query} action={groupHref} className="grid gap-cta" role="search">
        <SearchRow query={query} resetHref={groupHref} label={`Поиск по имени в группе «${group.name}»`} />
      </Form>

      <ContactList
        items={items}
        page={page}
        pageCount={pageCount}
        pageHref={(target) => groupPageHref({ groupId: group.id, query, page: target })}
        empty={
          <EmptyList
            query={query}
            inGroup
            hint="Добавь контакт кнопкой выше — группа будет уже отмечена. Или добавь людей в группу в их карточке."
          />
        }
      />
    </PageShell>
  );
}
