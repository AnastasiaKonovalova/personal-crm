"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { addContactToGroupAction, type GroupFieldState } from "@/app/contacts/actions";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AddToGroupFormProps = {
  contactId: string;
  // Groups the contact is not in yet, by name: suggestions of the field
  suggestions: { id: string; name: string }[];
};

// The card field «Группа: выбрать или новая» (design.md п.5): an existing name adds the contact to that
// group, a new name creates it. A plain form post without JavaScript returns to the card
export function AddToGroupForm({ contactId, suggestions }: AddToGroupFormProps) {
  const [state, formAction, pending] = useActionState<GroupFieldState, FormData>(
    addContactToGroupAction,
    {},
  );

  return (
    <form action={formAction} className="grid gap-2" noValidate>
      <input type="hidden" name="contactId" value={contactId} />
      <Label htmlFor="groupName" className="sr-only">
        Добавить в группу
      </Label>
      <div className="flex flex-wrap gap-cta">
        <Input
          // remounted after a save, so the field is empty again; on an error the typed text stays
          key={state.savedAt ?? "initial"}
          id="groupName"
          name="groupName"
          list="group-suggestions"
          maxLength={50}
          autoComplete="off"
          placeholder="Группа: выбрать или новая"
          defaultValue={state.groupName ?? ""}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "groupName-error" : undefined}
          className="min-w-0 flex-[1_1_240px] sm:max-w-[420px]"
        />
        <datalist id="group-suggestions">
          {suggestions.map((group) => (
            <option key={group.id} value={group.name} />
          ))}
        </datalist>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          <Plus aria-hidden="true" />
          {pending ? "Добавляю…" : "Добавить"}
        </Button>
      </div>
      {state.error && <FieldError id="groupName-error">{state.error}</FieldError>}
    </form>
  );
}
