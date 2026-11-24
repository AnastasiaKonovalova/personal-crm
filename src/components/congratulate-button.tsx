"use client";

import { useActionState } from "react";
import { Cake } from "lucide-react";
import { congratulateAction, type MarkContactedState } from "@/app/contacts/actions";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";

// «Поздравил(а)» in a row of the «Скоро день рождения» block, made like «Связались» in «Пора
// связаться»: ghost, on phones only the round icon, 44px. `returnTo` is the page of the block; the
// action redirects there only when the form is posted without JavaScript
export function CongratulateButton({
  contactId,
  name,
  returnTo,
}: {
  contactId: string;
  name: string;
  returnTo: string;
}) {
  const [state, formAction, pending] = useActionState<MarkContactedState, FormData>(
    congratulateAction,
    {},
  );

  return (
    <form action={formAction} className="grid justify-items-end gap-1">
      <input type="hidden" name="contactId" value={contactId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={`Поздравил(а): ${name}`}
        className="max-[560px]:size-hit-carousel max-[560px]:gap-0 max-[560px]:p-0"
      >
        <Cake className="size-[22px] text-teal-deep" aria-hidden="true" />
        <span className="max-[560px]:hidden">Поздравил(а)</span>
      </Button>
      {state.error && <FieldError role="alert">{state.error}</FieldError>}
    </form>
  );
}
