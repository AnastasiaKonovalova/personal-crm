"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BlockState, blockView } from "@/lib/reminders-view";

const edgePadding = "px-[clamp(18px,2.4vw,28px)]";

// The bottom bar of a home block: the pager «Страница X из Y» and «Показать все (N)» / «Свернуть».
// Each block keeps its own state and passes it here, so paging one block leaves the other alone.
// Without JavaScript the bar is hidden (data-js-only) and the block shows all its rows.
export function BlockFooter({
  view,
  total,
  title,
  onChange,
}: {
  view: ReturnType<typeof blockView>;
  total: number;
  title: string;
  onChange: (state: BlockState) => void;
}) {
  if (!view.canExpand && !view.expanded) return null;

  return (
    <div
      data-js-only=""
      className={
        view.expanded
          ? `flex flex-wrap items-center justify-between gap-controls border-t border-line ${edgePadding} py-2.5 max-[560px]:flex-col`
          : `border-t border-line ${edgePadding} py-1`
      }
    >
      {view.showPager && (
        <nav className="flex items-center gap-controls" aria-label={`Страницы блока «${title}»`}>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Назад"
            disabled={view.page <= 1}
            onClick={() => onChange({ expanded: true, page: view.page - 1 })}
          >
            <ChevronLeft />
          </Button>
          <span className="font-display text-counter font-semibold text-muted-foreground">
            Страница <b className="font-bold text-teal-deep">{view.page}</b>
            {` из ${view.pageCount}`}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Вперёд"
            disabled={view.page >= view.pageCount}
            onClick={() => onChange({ expanded: true, page: view.page + 1 })}
          >
            <ChevronRight />
          </Button>
        </nav>
      )}
      {/* the same button element in both states, so keyboard focus stays on it after the toggle */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={view.expanded}
        className={
          view.expanded
            ? "ml-auto text-teal-deep hover:text-ink max-[560px]:ml-0"
            : "text-teal-deep hover:text-ink"
        }
        onClick={() => onChange({ expanded: !view.expanded, page: 1 })}
      >
        {view.expanded ? "Свернуть" : `Показать все (${total})`}
        {view.expanded ? <ChevronUp /> : <ChevronDown />}
      </Button>
    </div>
  );
}
