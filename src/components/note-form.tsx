"use client";

import { useActionState } from "react";
import { addNoteAction, type NoteFormState } from "@/app/contacts/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NoteForm({ contactId }: { contactId: string }) {
  const [state, formAction, pending] = useActionState<NoteFormState, FormData>(addNoteAction, {});

  return (
    <form action={formAction} className="grid gap-3" noValidate>
      <input type="hidden" name="contactId" value={contactId} />
      <Label htmlFor="body" className="sr-only">
        Новая заметка
      </Label>
      <Textarea
        id="body"
        name="body"
        rows={3}
        placeholder="О чём поговорили, о чём договорились"
        defaultValue={state.body ?? ""}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "body-error" : undefined}
      />
      {state.error && (
        <p id="body-error" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняю…" : "Добавить заметку"}
        </Button>
        {state.savedAt && !pending && (
          <span className="text-sm text-muted-foreground" role="status">
            Заметка сохранена
          </span>
        )}
      </div>
    </form>
  );
}
