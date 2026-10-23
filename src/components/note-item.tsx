"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { updateNoteAction, type NoteFormState } from "@/app/contacts/actions";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type NoteItemProps = {
  contactId: string;
  note: { id: string; body: string; createdAt: string };
  // Formatted on the server so the date does not depend on the browser's time zone
  createdAtLabel: string;
};

export function NoteItem({ contactId, note, createdAtLabel }: NoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<NoteFormState, FormData>(
    async (previous, formData) => {
      const next = await updateNoteAction(previous, formData);
      if (next.savedAt) {
        setEditing(false);
      }
      return next;
    },
    {},
  );
  const bodyId = `note-${note.id}-body`;
  const errorId = `note-${note.id}-error`;

  return (
    <li
      className={cn(
        "grid gap-1.5 border-t border-line py-[18px]",
        // the note being edited sits on a bg panel that bleeds past the column edges
        editing &&
          "-mx-[18px] rounded-stat border-t-transparent bg-background px-[18px] max-[560px]:-mx-2.5 max-[560px]:px-2.5 max-[560px]:py-3.5",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <time dateTime={note.createdAt} className="font-display text-pill text-muted-foreground">
          {createdAtLabel}
        </time>
        {!editing && (
          <Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => setEditing(true)}>
            <Pencil />
            Изменить
          </Button>
        )}
      </div>
      {editing ? (
        <form action={formAction} className="grid gap-cta" noValidate>
          <input type="hidden" name="contactId" value={contactId} />
          <input type="hidden" name="noteId" value={note.id} />
          <div className="grid gap-2">
            <Label htmlFor={bodyId} className="sr-only">
              Текст заметки
            </Label>
            <Textarea
              id={bodyId}
              name="body"
              rows={3}
              defaultValue={state.body ?? note.body}
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? errorId : undefined}
              autoFocus
            />
            {state.error && <FieldError id={errorId}>{state.error}</FieldError>}
          </div>
          <div className="flex flex-wrap items-center gap-cta">
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              {pending ? "Сохраняю…" : "Сохранить"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => setEditing(false)}>
              Отмена
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap text-ink">{note.body}</p>
      )}
    </li>
  );
}
