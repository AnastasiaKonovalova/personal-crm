"use client";

import { useActionState } from "react";
import { addNoteAction, type NoteFormState } from "@/app/contacts/actions";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NoteForm({ contactId }: { contactId: string }) {
  const [state, formAction, pending] = useActionState<NoteFormState, FormData>(addNoteAction, {});

  return (
    <form action={formAction} className="grid gap-cta" noValidate>
      <input type="hidden" name="contactId" value={contactId} />
      <div className="grid gap-2">
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
        {state.error && <FieldError id="body-error">{state.error}</FieldError>}
      </div>
      <div className="flex flex-wrap items-center gap-cta">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняю…" : "Добавить заметку"}
        </Button>
        {state.savedAt && !pending && (
          <span
            className="inline-flex items-center gap-2 text-caption text-teal-deep before:size-[7px] before:rounded-round before:bg-teal before:content-['']"
            role="status"
          >
            Заметка сохранена
          </span>
        )}
      </div>
    </form>
  );
}
