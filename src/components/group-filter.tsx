"use client";

import { ChevronDown } from "lucide-react";
import { fieldClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SELECT_ID = "group-filter";

// «Фильтр по группам» (design.md п.8): a native select whose caption sits inside the same field.
// Without JavaScript «Найти» applies it together with the search; with JavaScript a choice applies at once.
// «Все группы» (empty value) is the reset: there is no separate button
export function GroupFilter({
  groups,
  groupId,
}: {
  groups: { id: string; name: string }[];
  groupId?: string;
}) {
  return (
    <span className="relative block max-w-80 max-[680px]:max-w-none">
      <label
        htmlFor={SELECT_ID}
        className="pointer-events-none absolute top-[9px] left-[21px] z-1 font-sans text-pill font-semibold tracking-normal text-muted-foreground"
      >
        Фильтр по группам
      </label>
      <select
        id={SELECT_ID}
        name="group"
        defaultValue={groupId ?? ""}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className={cn(
          fieldClasses,
          "cursor-pointer appearance-none rounded-card pt-[27px] pr-12 pb-[9px]",
        )}
      >
        <option value="">Все группы</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-[18px] size-5 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}
