"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  createContactAction,
  updateContactAction,
  type ContactFormState,
} from "@/app/contacts/actions";
import { CadenceFields } from "@/components/cadence-fields";
import { FieldError } from "@/components/field-error";
import { GroupFields } from "@/components/group-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContactField } from "@/lib/validation";

const fields: {
  name: ContactField;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}[] = [
  { name: "name", label: "Имя", placeholder: "Анна Смирнова", required: true },
  { name: "about", label: "Кто это", placeholder: "Дизайнер, соседка по даче" },
  { name: "howWeMet", label: "Откуда знакомы", placeholder: "Учились вместе на курсах" },
  { name: "phone", label: "Телефон", type: "tel", placeholder: "+7 900 123-45-67" },
  { name: "email", label: "Почта", type: "email", placeholder: "anna@example.com" },
];

type EditedContact = { id: string } & Record<ContactField, string | null>;

type ContactFormProps = {
  contact?: EditedContact;
  // All groups for the ticks, by name
  groups: { id: string; name: string }[];
  // Ticked on open: the edited contact's groups, or the group from /contacts/new?group=<id>
  groupIds: string[];
  // Where «Отмена» leads: the page the form was opened from
  cancelHref: string;
};

// Without a contact the form creates a new one, with a contact it edits that contact
export function ContactForm({ contact, groups, groupIds, cancelHref }: ContactFormProps) {
  const [state, formAction, pending] = useActionState<ContactFormState, FormData>(
    contact ? updateContactAction : createContactAction,
    {},
  );

  return (
    <form
      action={formAction}
      className="grid gap-heading rounded-card border border-line bg-surface p-[clamp(22px,2.6vw,30px)]"
      noValidate
    >
      {contact && <input type="hidden" name="contactId" value={contact.id} />}
      {state.formError && <FieldError role="alert">{state.formError}</FieldError>}
      {fields.map((field) => {
        const error = state.errors?.[field.name];
        const errorId = `${field.name}-error`;
        return (
          <div key={field.name} className="grid gap-2">
            <Label htmlFor={field.name}>
              {field.label}
              {field.required && <span className="text-brown">*</span>}
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
            {error && <FieldError id={errorId}>{error}</FieldError>}
          </div>
        );
      })}
      <CadenceFields
        // remounted when the defaults change: React reads a select's defaultValue only on mount,
        // and the form reset after a failed submit would otherwise bring back the first value
        // prefixed: sibling keys must differ, and both blocks give "|" on an empty form
        key={`cadence:${state.values?.cadence ?? contact?.cadence ?? ""}|${state.values?.contactOn ?? contact?.contactOn ?? ""}`}
        defaultCadence={state.values?.cadence ?? contact?.cadence ?? ""}
        defaultContactOn={state.values?.contactOn ?? contact?.contactOn ?? ""}
        errors={state.errors}
      />
      <GroupFields
        // remounted with the returned values, like CadenceFields: a form reset after a failed submit
        // must bring back what was ticked and typed, not the values the form opened with
        key={`groups:${(state.values?.groupIds ?? groupIds).join(",")}|${state.values?.newGroup ?? ""}`}
        groups={groups}
        defaultGroupIds={state.values?.groupIds ?? groupIds}
        defaultNewGroup={state.values?.newGroup ?? ""}
        errors={state.errors}
      />
      <div className="flex flex-wrap gap-cta">
        <Button type="submit" disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button asChild variant="outline">
          <Link href={cancelHref}>Отмена</Link>
        </Button>
      </div>
    </form>
  );
}
