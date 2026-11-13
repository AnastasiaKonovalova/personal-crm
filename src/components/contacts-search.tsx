import Link from "next/link";
import { Search } from "lucide-react";
import { GroupFilter } from "@/components/group-filter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contactsHref } from "@/lib/contact-list";

// The search row: field, «Найти» and «Сбросить» (only while a search is set). Shared by the main page
// and the group page; «Сбросить» drops only the search and keeps the rest of the address (resetHref)
export function SearchRow({
  query,
  resetHref,
  label,
}: {
  query: string;
  resetHref: string;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-cta">
      {/* 200px basis keeps «Найти» on the same line at 390 */}
      <label className="relative min-w-0 flex-[1_1_200px]">
        <span className="sr-only">{label}</span>
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
      {/* «Найти» and «Сбросить» wrap as one unit */}
      <span className="flex flex-none items-center gap-cta">
        <Button type="submit" variant="outline">
          Найти
        </Button>
        {query && (
          <Button asChild variant="ghost" className="px-0">
            <Link href={resetHref} aria-label="Сбросить поиск">
              Сбросить
            </Link>
          </Button>
        )}
      </span>
    </div>
  );
}

// Fields of the main page search form: the search row, then the group filter on its own row (design.md п.8).
// The page wraps them in one GET form, so «Найти» sends both q and group
export function ContactsSearch({
  query,
  groupId,
  groups,
}: {
  query: string;
  groupId?: string;
  groups: { id: string; name: string }[];
}) {
  return (
    <>
      <SearchRow query={query} resetHref={contactsHref({ groupId })} label="Поиск по имени" />
      {groups.length > 0 ? (
        <GroupFilter groups={groups} groupId={groupId} />
      ) : (
        // No groups yet: a filter with only «Все группы» is useless, so point to where groups are made
        <Button asChild variant="link" className="justify-self-start px-0">
          <Link href="/groups#new-group">Тут можно создавать группы контактов</Link>
        </Button>
      )}
    </>
  );
}
