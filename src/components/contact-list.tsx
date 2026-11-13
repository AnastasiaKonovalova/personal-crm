import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DueDot, DueDotLabel } from "@/components/due-dot";
import { RowGroups } from "@/components/row-groups";
import { Button } from "@/components/ui/button";

// The contact list shared by the main page and the group page (design.md п.12), so their rows don't drift apart

export type ContactListItem = {
  id: string;
  name: string;
  about: string | null;
  howWeMet: string | null;
  status: { kind: "overdue" | "soon" | "ok" } | null;
  groups: { id: string; name: string }[];
};

// Columns of the contact list (design.md п.6): the groups column is wider above 1100px;
// at 680px and below only the name, "who", the groups line and the chevron stay
const rowGrid =
  "grid grid-cols-[1fr_1.2fr_1fr_1.6fr_20px] items-center gap-grid px-[clamp(18px,2.4vw,28px)] py-3.5 max-[1100px]:grid-cols-[1fr_1.2fr_1fr_1.3fr_20px]";

// Keyboard focus of the row link shows on the whole row, as when the row itself was the link
const rowFocus =
  "has-[a:focus-visible]:bg-teal-soft has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-ring has-[a:focus-visible]:outline-solid";
const rowActive = "group-hover:text-teal-deep group-has-[a:focus-visible]:text-teal-deep";

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

export function ContactList({
  items,
  page,
  pageCount,
  pageHref,
  empty,
}: {
  items: ContactListItem[];
  page: number;
  pageCount: number;
  pageHref: (page: number) => string;
  empty: React.ReactNode;
}) {
  return (
    <>
      {items.length === 0 ? (
        empty
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
          <PageArrow label="Назад" href={page > 1 ? pageHref(page - 1) : undefined}>
            <ChevronLeft />
          </PageArrow>
          <span className="font-display text-counter font-semibold text-muted-foreground">
            Страница <b className="font-bold text-teal-deep">{page}</b>
            {` из ${pageCount}`}
          </span>
          <PageArrow label="Вперёд" href={page < pageCount ? pageHref(page + 1) : undefined}>
            <ChevronRight />
          </PageArrow>
        </nav>
      )}
    </>
  );
}
