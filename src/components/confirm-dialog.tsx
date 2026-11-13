"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { CloseButton, closeButtonClasses } from "@/components/close-button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  alertDialogContentClasses,
  alertDialogDescriptionClasses,
  alertDialogOverlayClasses,
  alertDialogTitleClasses,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type ConfirmDialogProps = {
  // The trigger is a link to the page with the dialog open (e.g. /groups?delete=<id>), so it works without JS
  triggerHref: string;
  triggerLabel?: string;
  triggerClassName?: string;
  children: React.ReactNode;
  // The same page without the parameter; «Отмена» and the cross lead there without JS
  closeHref: string;
  // The server saw the parameter: the dialog is open on load
  initiallyOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  action: (formData: FormData) => Promise<void>;
  // Hidden fields of the confirm form; ids go here rather than through .bind() (no-JS forms)
  fields: Record<string, string>;
};

const noSubscribe = () => () => {};

function ConfirmButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function HiddenFields({ fields }: { fields: Record<string, string> }) {
  return Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
}

// Confirmation that works with and without JavaScript. Without JS the trigger navigates to the page with
// the parameter and the server renders the dialog as plain markup. With JS the trigger opens the Radix
// dialog in place (focus trap, Escape); a dialog opened from the URL is swapped for the Radix one after
// hydration, and closing it drops the parameter. Focus lands on «Отмена», so Enter does not confirm.
export function ConfirmDialog({
  triggerHref,
  triggerLabel,
  triggerClassName,
  children,
  closeHref,
  initiallyOpen,
  title,
  description,
  confirmLabel,
  pendingLabel,
  action,
  fields,
}: ConfirmDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  // false on the server and during hydration, true afterwards
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && initiallyOpen) {
      router.replace(closeHref, { scroll: false });
    }
  }

  const trigger = (
    <Link
      href={triggerHref}
      scroll={false}
      aria-label={triggerLabel}
      className={triggerClassName}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        setOpen(true);
      }}
    >
      {children}
    </Link>
  );

  if (!hydrated) {
    return (
      <>
        {trigger}
        {initiallyOpen && (
          <div className={alertDialogOverlayClasses}>
            <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className={alertDialogContentClasses}>
              <a href={closeHref} aria-label="Закрыть" className={`${closeButtonClasses} absolute top-cta right-cta`}>
                <X aria-hidden="true" className="size-5" />
              </a>
              <h2 id={titleId} className={alertDialogTitleClasses}>
                {title}
              </h2>
              <p id={descriptionId} className={alertDialogDescriptionClasses}>
                {description}
              </p>
              <form action={action} className="mt-cta flex flex-wrap gap-cta">
                <HiddenFields fields={fields} />
                <ConfirmButton label={confirmLabel} pendingLabel={pendingLabel} />
                {/* autoFocus: the safe action has focus when the page opens with the dialog */}
                <Button asChild variant="outline">
                  <a href={closeHref} autoFocus>
                    Отмена
                  </a>
                </Button>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {trigger}
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
        >
          <AlertDialogCancel asChild>
            <CloseButton className="absolute top-cta right-cta" />
          </AlertDialogCancel>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          <form action={action} className="mt-cta flex flex-wrap gap-cta">
            <HiddenFields fields={fields} />
            <ConfirmButton label={confirmLabel} pendingLabel={pendingLabel} />
            <AlertDialogCancel asChild>
              <Button ref={cancelRef} type="button" variant="outline">
                Отмена
              </Button>
            </AlertDialogCancel>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
