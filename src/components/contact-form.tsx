"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createContactAction,
  updateContactAction,
  type ContactFormState,
} from "@/app/contacts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContactField } from "@/lib/validation";

const fields: { name: ContactField; label: string; type?: string; placeholder?: string; required?: boolean }[] = [
  { name: "name", label: "Имя", placeholder: "Анна Смирнова", required: true },
  { name: "about", label: "Кто это", placeholder: "Дизайнер, соседка по даче" },
  { name: "howWeMet", label: "Откуда знакомы", placeholder: "Учились вместе на курсах" },
  { name: "phone", label: "Телефон", type: "tel", placeholder: "+7 900 123-45-67" },
  { name: "email", label: "Почта", type: "email", placeholder: "anna@example.com" },
];

type EditedContact = { id: string } & Record<ContactField, string | null>;

// Without a contact the form creates a new one, with a contact it edits that contact
export function ContactForm({ contact }: { contact?: EditedContact }) {
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(
    contact ? updateContactAction : createContactAction,
    {},
  );

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {contact && <input type="hidden" name="contactId" value={contact.id} />}
      {state.formError && (
        <p className="text-sm text-destructive" role="alert">
          {state.formError}
        </p>
      )}
      {fields.map((field) => {
        const error = state.errors?.[field.name];
        const errorId = `${field.name}-error`;
        return (
          <div key={field.name} className="grid gap-2">
            <Label htmlFor={field.name}>
              {field.label}
              {field.required && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={field.name}
              name={field.name}
              type={field.type ?? "text"}
              placeholder={field.placeholder}
              defaultValue={state.values?.[field.name] ?? contact?.[field.name] ?? ""}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              autoFocus={field.name === "name"}
            />
            {error && (
              <p id={errorId} className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button asChild variant="outline">
          <Link href={contact ? `/contacts/${contact.id}` : "/"}>Отмена</Link>
        </Button>
      </div>
    </form>
  );
}
