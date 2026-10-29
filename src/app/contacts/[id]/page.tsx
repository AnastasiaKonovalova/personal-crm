import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { DeleteContactButton } from "@/components/delete-contact-button";
import { NoteForm } from "@/components/note-form";
import { NoteItem } from "@/components/note-item";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { getContactWithNotes } from "@/server/contacts";

const dateFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" });

const cardClasses = "rounded-card border border-line bg-surface p-[clamp(22px,2.6vw,30px)]";
const linkClasses =
  "border-b border-line transition-colors duration-200 hover:border-teal-deep hover:text-teal-deep";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-grid border-b border-line py-3.5 first:pt-0 last:border-b-0 last:pb-0 max-[560px]:grid-cols-1 max-[560px]:gap-1">
      <dt className="pt-1 font-display text-badge text-muted-foreground uppercase">{label}</dt>
      <dd className="text-ink">{children ?? <span className="text-muted-foreground">—</span>}</dd>
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
    <PageShell width="narrow" className="grid gap-heading">
      <BackLink href="/">Все контакты</BackLink>

      <div className="flex flex-wrap items-end justify-between gap-grid">
        <h1 className="font-display text-page-title font-semibold">{contact.name}</h1>
        <div className="flex flex-wrap items-center gap-controls">
          <Button asChild variant="outline" size="sm">
            <Link href={`/contacts/${contact.id}/edit`}>
              <Pencil />
              Редактировать
            </Link>
          </Button>
          <DeleteContactButton contactId={contact.id} />
        </div>
      </div>

      <section className={cardClasses} aria-label="Данные контакта">
        <dl>
          <Field label="Кто это">{contact.about}</Field>
          <Field label="Откуда знакомы">{contact.howWeMet}</Field>
          <Field label="Телефон">
            {contact.phone && (
              <a href={`tel:${contact.phone.replace(/[^0-9+]/g, "")}`} className={linkClasses}>
                {contact.phone}
              </a>
            )}
          </Field>
          <Field label="Почта">
            {contact.email && (
              <a href={`mailto:${contact.email}`} className={linkClasses}>
                {contact.email}
              </a>
            )}
          </Field>
        </dl>
      </section>

      <section className={cardClasses} aria-labelledby="notes-title">
        <h2 id="notes-title" className="mb-controls font-display text-notes-title font-semibold">
          Заметки
        </h2>
        <NoteForm contactId={contact.id} />
        {notes.length === 0 ? (
          <p className="mt-heading text-muted-foreground">Заметок пока нет</p>
        ) : (
          <ul className="mt-heading grid" data-testid="notes">
            {notes.map((note) => (
              <NoteItem
                key={note.id}
                contactId={contact.id}
                note={{ id: note.id, body: note.body, createdAt: note.createdAt.toISOString() }}
                createdAtLabel={dateFormat.format(note.createdAt)}
              />
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
