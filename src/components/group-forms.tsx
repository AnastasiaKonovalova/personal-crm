"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createGroupAction, renameGroupAction, type GroupFormState } from "@/app/groups/actions";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Same limit as groupNameSchema; the server checks it again
const NAME_MAX_LENGTH = 50;
const fieldRowClasses = "flex flex-wrap items-center gap-cta";
const nameInputClasses = "flex-[1_1_220px] max-w-[420px]";

// «Новая группа» at the top of /groups. After a save with JS the form is remounted, so the field is empty
export function CreateGroupForm({ className }: { className?: string }) {
  const [state, formAction, pending] = useActionState<GroupFormState, FormData>(
    createGroupAction,
    {},
  );

  return (
    <form key={state.savedAt} action={formAction} className={className} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="new-group">Новая группа</Label>
        <div className={fieldRowClasses}>
          <Input
            id="new-group"
            name="name"
            maxLength={NAME_MAX_LENGTH}
            placeholder="Например, Теннис"
            defaultValue={state.name ?? ""}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "new-group-error" : undefined}
            className={nameInputClasses}
          />
          <Button type="submit" disabled={pending}>
            <Plus />
            {pending ? "Создаю…" : "Создать"}
          </Button>
        </div>
        {state.error && <FieldError id="new-group-error">{state.error}</FieldError>}
      </div>
    </form>
  );
}

// Renaming in place of the group's row (/groups?edit=<id>); success redirects to /groups
export function RenameGroupForm({ group }: { group: { id: string; name: string } }) {
  const [state, formAction, pending] = useActionState<GroupFormState, FormData>(
    renameGroupAction,
    {},
  );
  const inputId = `rename-${group.id}`;
  const errorId = `rename-${group.id}-error`;

  return (
    <form
      action={formAction}
      className="grid gap-2 border-b border-line bg-background px-[clamp(18px,2.4vw,28px)] py-3.5 last:border-b-0"
      noValidate
    >
      <input type="hidden" name="groupId" value={group.id} />
      <Label htmlFor={inputId} className="sr-only">
        {`Новое название группы «${group.name}»`}
      </Label>
      <div className={fieldRowClasses}>
        <Input
          id={inputId}
          name="name"
          maxLength={NAME_MAX_LENGTH}
          defaultValue={state.name ?? group.name}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className={nameInputClasses}
          autoFocus
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button asChild variant="ghost" size="sm" className="px-0">
          <Link href="/groups" scroll={false}>
            Отмена
          </Link>
        </Button>
      </div>
      {state.error && <FieldError id={errorId}>{state.error}</FieldError>}
    </form>
  );
}
