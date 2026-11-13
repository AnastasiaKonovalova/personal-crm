import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { DeletedToast } from "@/components/deleted-toast";
import { DueDot, DueDotLabel } from "@/components/due-dot";
import { PageShell } from "@/components/page-shell";
import { RemindersBlock } from "@/components/reminders-block";
import { RowGroups } from "@/components/row-groups";
import { SectionSwitch } from "@/components/section-switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CADENCE_LABELS, dueText, toDateString } from "@/lib/keep-in-touch";
import { listContacts, listReminders } from "@/server/contacts";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Columns of the contact list (design.md п.6): the groups column is wider above 1100px;
// at 680px and below only the name, "who", the groups line and the chevron stay
const rowGrid =
  "grid grid-cols-[1fr_1.2fr_1fr_1.6fr_20px] items-center gap-grid px-[clamp(18px,2.4vw,28px)] py-3.5 max-[1100px]:grid-cols-[1fr_1.2fr_1fr_1.3fr_20px]";

// Keyboard focus of the row link shows on the whole row, as when the row itself was the link
const rowFocus =
  "has-[a:focus-visible]:bg-teal-soft has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-ring has-[a:focus-visible]:outline-solid";
const rowActive = "group-hover:text-teal-deep group-has-[a:focus-visible]:text-teal-deep";

function pageHref(query: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

// Round pagination arrow; on the first/last page it stays visible but inactive
function PageArrow({ href, label, children }: { href?: string; label: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="outline" size="icon">
      {href ? (
        <Link href={href} aria-label={label}>
          {children}
        </Link>
      ) : (
        <span role="link" aria-disabled="true" aria-label={label}>
          {children}
        </span>
      )}
    </Button>
  );
}

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const requestedPage = typeof params.page === "string" ? Number(params.page) : 1;

  const { items, total, page, pageCount } = await listContacts({ query, page: requestedPage });

  // The "Пора связаться" block is for the first page of the plain list: not in search, not on page 2+,
  // and not when there are no contacts at all
  const reminders = !query && page === 1 && total > 0 ? await listReminders() : null;
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
            {query ? `Найдено: ${total}` : `Всего: ${total}`}
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

      <Form action="/" className="flex flex-wrap gap-cta" role="search">
        {/* 200px basis keeps «Найти» on the same line at 390 */}
        <label className="relative min-w-0 flex-[1_1_200px]">
          <span className="sr-only">Поиск по имени</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-[18px] size-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Поиск по имени"
            className="pl-12"
          />
        </label>
        <Button type="submit" variant="outline">
          Найти
        </Button>
        {query && (
          <Button asChild variant="ghost" className="px-0">
            <Link href="/">Сбросить</Link>
          </Button>
        )}
      </Form>

      {items.length === 0 ? (
        <div className="rounded-contact border border-line bg-surface bg-[radial-gradient(circle_at_85%_0,var(--accent-soft),transparent_55%)] px-[clamp(24px,4vw,48px)] py-[clamp(36px,5vw,64px)] text-center">
          <h2 className="mx-auto max-w-[22ch] font-display text-empty-title font-semibold">
            {query ? `По запросу «${query}» никого не нашлось` : "Контактов пока нет"}
          </h2>
          {query && (
            <p className="mx-auto mt-3.5 max-w-[44ch] text-muted-foreground">
              Проверь написание или поищи по части имени. Регистр, «е» и «ё» не важны.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div
            aria-hidden="true"
            className={`${rowGrid} border-b border-line bg-background font-display text-badge text-muted-foreground uppercase max-[680px]:hidden`}
          >
            <span className="pl-[18px]">Имя</span>
            <span>Кто это</span>
            <span>Откуда знакомы</span>
            <span>Группы</span>
            <span />
          </div>
          <ul>
            {items.map((contact) => (
              // The row is not a link: «+N» buttons can't sit inside <a>. The name link's ::after covers the row
              // (design.md п.7), so a click anywhere but «+N» opens the card
              <li
                key={contact.id}
                className={`${rowGrid} ${rowFocus} group relative border-b border-line transition-colors duration-200 last:border-b-0 hover:bg-teal-soft max-[680px]:grid-cols-[1fr_20px] max-[680px]:gap-x-3 max-[680px]:gap-y-0.5 max-[680px]:px-5 max-[680px]:py-4`}
              >
                <span className={`flex items-center gap-2.5 font-bold text-ink ${rowActive} max-[680px]:col-start-1`}>
                  <DueDot kind={contact.status?.kind} />
                  <Link
                    href={`/contacts/${contact.id}`}
                    className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                  >
                    {contact.name}
                    <DueDotLabel kind={contact.status?.kind} />
                  </Link>
                </span>
                <span className="text-meta text-muted-foreground max-[680px]:col-start-1 max-[680px]:pl-[18px]">
                  {contact.about ?? "—"}
                </span>
                <span className="text-meta text-muted-foreground max-[680px]:hidden">{contact.howWeMet ?? "—"}</span>
                <RowGroups groups={contact.groups} />
                <span
                  className={`flex text-muted-foreground transition-[color,transform] duration-[350ms] ease-spring group-hover:translate-x-[3px] group-has-[a:focus-visible]:translate-x-[3px] ${rowActive} motion-reduce:transition-none max-[680px]:col-start-2 max-[680px]:row-span-2 max-[680px]:row-start-1`}
                >
                  <ChevronRight aria-hidden="true" className="size-5" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-center gap-controls" aria-label="Страницы">
          <PageArrow label="Назад" href={page > 1 ? pageHref(query, page - 1) : undefined}>
            <ChevronLeft />
          </PageArrow>
          <span className="font-display text-counter font-semibold text-muted-foreground">
            Страница <b className="font-bold text-teal-deep">{page}</b>
            {` из ${pageCount}`}
          </span>
          <PageArrow label="Вперёд" href={page < pageCount ? pageHref(query, page + 1) : undefined}>
            <ChevronRight />
          </PageArrow>
        </nav>
      )}

      {/* fixed to the viewport, so it takes no grid cell */}
      {params.deleted === "1" && <DeletedToast />}
    </PageShell>
  );
}
