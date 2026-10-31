"use client";

import { useActionState } from "react";
import { setCadenceAction, type CadenceFormState } from "@/app/contacts/actions";
import { CadenceFields } from "@/components/cadence-fields";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";

// Changing the frequency in place, from the contact card; works without JavaScript
export function CadenceForm({
  contactId,
  cadence,
  contactOn,
}: {
  contactId: string;
  cadence: string | null;
  contactOn: string | null;
}) {
  const [state, formAction, pending] = useActionState<CadenceFormState, FormData>(setCadenceAction, {});

  return (
    <form action={formAction} className="grid gap-2 border-t border-line pt-controls" noValidate>
      <input type="hidden" name="contactId" value={contactId} />
      {state.formError && <FieldError role="alert">{state.formError}</FieldError>}
      <CadenceFields
        // remounted when the defaults change, see contact-form.tsx
        key={`${state.values?.cadence ?? cadence ?? ""}|${state.values?.contactOn ?? contactOn ?? ""}`}
        idPrefix="card-"
        cardLabel
        defaultCadence={state.values?.cadence ?? cadence ?? ""}
        defaultContactOn={state.values?.contactOn ?? contactOn ?? ""}
        errors={state.errors}
      >
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        {state.savedAt && !pending && (
          <span
            className="inline-flex items-center gap-2 text-caption text-teal-deep before:size-[7px] before:rounded-round before:bg-teal before:content-['']"
            role="status"
          >
            Сохранено
          </span>
        )}
      </CadenceFields>
    </form>
  );
}
