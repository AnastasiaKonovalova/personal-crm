"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { updateNoteAction, type NoteFormState } from "@/app/contacts/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
    <li className="grid gap-1 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <time dateTime={note.createdAt} className="text-xs text-muted-foreground">
          {createdAtLabel}
        </time>
        {!editing && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil />
            Изменить
          </Button>
        )}
      </div>
      {editing ? (
        <form action={formAction} className="grid gap-3" noValidate>
          <input type="hidden" name="contactId" value={contactId} />
          <input type="hidden" name="noteId" value={note.id} />
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
          {state.error && (
            <p id={errorId} className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <div className="flex gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Сохраняю…" : "Сохранить"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Отмена
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap">{note.body}</p>
      )}
    </li>
  );
}
