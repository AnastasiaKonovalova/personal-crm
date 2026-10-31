"use client";

import { useActionState } from "react";
import { markContactedAction, type MarkContactedState } from "@/app/contacts/actions";
import { ContactedIcon } from "@/components/contacted-icon";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// "Связались": adds the note «Связались». `returnTo` makes the action redirect back to the page
// ("/" or the contact card), but only when the form is posted without JavaScript: that keeps a page
// refresh from sending it twice. With JavaScript the page updates in place and the action does not redirect.
// `compact` is for rows of the block: on phones only the round icon stays, 44px.
export function MarkContactedButton({
  contactId,
  name,
  returnTo,
  compact,
}: {
  contactId: string;
  name?: string;
  returnTo?: "/" | "card";
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<MarkContactedState, FormData>(markContactedAction, {});

  return (
    <form action={formAction} className="grid justify-items-end gap-1">
      <input type="hidden" name="contactId" value={contactId} />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={name ? `Связались: ${name}` : undefined}
        className={cn(compact && "max-[560px]:size-hit-carousel max-[560px]:gap-0 max-[560px]:p-0")}
      >
        <ContactedIcon />
        <span className={cn(compact && "max-[560px]:hidden")}>Связались</span>
      </Button>
      {state.error && <FieldError role="alert">{state.error}</FieldError>}
    </form>
  );
}
