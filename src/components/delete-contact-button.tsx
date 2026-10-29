"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { deleteContactAction } from "@/app/contacts/actions";
import { CloseButton } from "@/components/close-button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Удаляю…" : "Удалить"}
    </Button>
  );
}

export function DeleteContactButton({ contactId }: { contactId: string }) {
  // Focus lands on «Отмена», so Enter right after opening does not delete
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="px-0">
          <Trash2 />
          Удалить
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <AlertDialogCancel asChild>
          <CloseButton className="absolute top-cta right-cta" />
        </AlertDialogCancel>
        <AlertDialogTitle>Удалить контакт?</AlertDialogTitle>
        <AlertDialogDescription>Заметки тоже удалятся.</AlertDialogDescription>
        <form action={deleteContactAction} className="mt-cta flex flex-wrap gap-cta">
          <input type="hidden" name="contactId" value={contactId} />
          <ConfirmButton />
          <AlertDialogCancel asChild>
            <Button ref={cancelRef} type="button" variant="outline">
              Отмена
            </Button>
          </AlertDialogCancel>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
