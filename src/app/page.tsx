import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listContacts } from "@/server/contacts";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pageHref(query: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

export default async function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim() : "";
  const requestedPage = typeof params.page === "string" ? Number(params.page) : 1;

  const { items, total, page, pageCount } = await listContacts({ query, page: requestedPage });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">Контакты</h1>
          <p className="text-sm text-muted-foreground" data-testid="contacts-total">
            {query ? `Найдено: ${total}` : `Всего: ${total}`}
          </p>
        </div>
        <Button asChild>
          <Link href="/contacts/new">
            <Plus />
            Добавить контакт
          </Link>
        </Button>
      </div>

      <Form action="/" className="flex gap-2" role="search">
        <Input
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Поиск по имени"
          aria-label="Поиск по имени"
        />
        <Button type="submit" variant="secondary">
          <Search />
          Найти
        </Button>
        {query && (
          <Button asChild variant="ghost">
            <Link href="/">Сбросить</Link>
          </Button>
        )}
      </Form>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
          {query ? `По запросу «${query}» никого не нашлось` : "Контактов пока нет"}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Имя</TableHead>
              <TableHead>Кто это</TableHead>
              <TableHead className="hidden sm:table-cell">Откуда знакомы</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((contact) => (
              <TableRow key={contact.id}>
                <TableCell className="font-medium">
                  <Link href={`/contacts/${contact.id}`} className="hover:underline">
                    {contact.name}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal text-muted-foreground">
                  {contact.about ?? "—"}
                </TableCell>
                <TableCell className="hidden whitespace-normal text-muted-foreground sm:table-cell">
                  {contact.howWeMet ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between gap-4" aria-label="Страницы">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(query, page - 1)}>
                <ChevronLeft />
                Назад
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Страница {page} из {pageCount}
          </span>
          {page < pageCount ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(query, page + 1)}>
                Вперёд
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
