import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { NoteForm } from "@/components/note-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getContactWithNotes } from "@/server/contacts";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>{children ?? "—"}</dd>
    </div>
  );
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getContactWithNotes(id);
  if (!data) {
    notFound();
  }
  const { contact, notes } = data;

  return (
    <div className="grid gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href="/">
            <ChevronLeft />
            Все контакты
          </Link>
        </Button>
      </div>

      <h1 className="text-2xl font-semibold">{contact.name}</h1>

      <dl className="grid gap-3">
        <Field label="Кто это">{contact.about}</Field>
        <Field label="Откуда знакомы">{contact.howWeMet}</Field>
        <Field label="Телефон">
          {contact.phone && (
            <a href={`tel:${contact.phone.replace(/[^0-9+]/g, "")}`} className="hover:underline">
              {contact.phone}
            </a>
          )}
        </Field>
        <Field label="Почта">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="hover:underline">
              {contact.email}
            </a>
          )}
        </Field>
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>Заметки</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <NoteForm contactId={contact.id} />
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Заметок пока нет</p>
          ) : (
            <ul className="grid gap-4" data-testid="notes">
              {notes.map((note) => (
                <li key={note.id} className="grid gap-1 border-t pt-4">
                  <time
                    dateTime={note.createdAt.toISOString()}
                    className="text-xs text-muted-foreground"
                  >
                    {dateFormat.format(note.createdAt)}
                  </time>
                  <p className="whitespace-pre-wrap">{note.body}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
