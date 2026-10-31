"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, HeartHandshake } from "lucide-react";
import { DueDot, DueDotLabel } from "@/components/due-dot";
import { MarkContactedButton } from "@/components/mark-contacted-button";
import { Button } from "@/components/ui/button";
import { blockView, type BlockState } from "@/lib/reminders-view";

export type ReminderRow = {
  id: string;
  name: string;
  kind: "overdue" | "soon";
  // Ready-made on the server ("просрочено на 13 дней", "До 1 ноября"): dates are formatted once
  text: string;
  cadenceLabel: string;
};

const edgePadding = "px-[clamp(18px,2.4vw,28px)]";

// The "Пора связаться" block. The server sends every row; this component only decides which are
// shown, so expanding and paging need no request. Rows outside the view are hidden by CSS (data-row-out),
// which applies only with JavaScript: without it all rows stay visible and the buttons (data-js-only) vanish.
export function RemindersBlock({ rows, hasCadence }: { rows: ReminderRow[]; hasCadence: boolean }) {
  const [state, setState] = useState<BlockState>({ expanded: false, page: 1 });
  const view = blockView(rows.length, state);

  // After «Связались» the server sends fewer rows. Keep the state in line with what is shown:
  // 5 rows or fewer drop the expansion for good, an emptied page falls back to the last one.
  if (state.expanded !== view.expanded || (state.expanded && state.page !== view.page)) {
    setState({ expanded: view.expanded, page: view.page });
  }

  if (rows.length === 0) {
    return hasCadence ? (
      <section className="overflow-hidden rounded-card border border-line bg-surface" aria-labelledby="reminders-title">
        <h2 id="reminders-title" className="px-[clamp(18px,2.4vw,28px)] pt-[clamp(18px,2.4vw,24px)] pb-3 font-display text-notes-title font-semibold">
          Пора связаться
        </h2>
        <div className={`flex items-center gap-grid ${edgePadding} pt-1.5 pb-[clamp(18px,2.4vw,24px)]`}>
          <span className="grid size-12 shrink-0 place-items-center rounded-round bg-teal-soft text-teal-deep" aria-hidden="true">
            <HeartHandshake className="size-6" />
          </span>
          <p className="font-display text-body-lg font-semibold text-ink">Со всеми на связи</p>
        </div>
      </section>
    ) : (
      <section className="overflow-hidden rounded-card border border-line bg-surface" aria-label="Пора связаться">
        <p className="max-w-[52ch] px-[clamp(18px,2.4vw,28px)] py-[clamp(18px,2.4vw,24px)] text-muted-foreground">
          Задай частоту общения в карточке контакта — и здесь появятся те, с кем{" "}
          <b className="font-bold text-ink">пора связаться</b>
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface" aria-labelledby="reminders-title">
      <div className={`flex items-baseline gap-cta ${edgePadding} pt-[clamp(18px,2.4vw,24px)] pb-3`}>
        <h2 id="reminders-title" className="font-display text-notes-title font-semibold">
          Пора связаться
        </h2>
        <span className="font-display text-counter font-semibold text-muted-foreground">{rows.length}</span>
      </div>

      <ul>
        {rows.map((row, index) => (
          <li
            key={row.id}
            data-row-out={index < view.from || index >= view.to ? "" : undefined}
            className={`group relative grid grid-cols-[8px_1fr_auto] items-center gap-x-grid gap-y-0.5 border-t border-line ${edgePadding} py-3 transition-colors duration-200 hover:bg-teal-soft`}
          >
            <span className="col-start-1 row-start-1 flex">
              <DueDot kind={row.kind} />
            </span>
            {/* the link's ::after covers the whole row, so the row opens the card; the button sits above it */}
            <Link
              href={`/contacts/${row.id}`}
              className="col-start-2 row-start-1 font-bold text-ink transition-colors duration-200 after:absolute after:inset-0 after:content-[''] group-hover:text-teal-deep"
            >
              {row.name}
              <DueDotLabel kind={row.kind} />
            </Link>
            <p className="col-start-2 row-start-2 text-meta text-muted-foreground">
              {row.kind === "overdue" ? (
                <>
                  <span className="font-semibold whitespace-nowrap text-danger">{row.text}</span>{" "}
                  <span className="whitespace-nowrap before:content-['·_'] max-[560px]:block max-[560px]:before:content-none">
                    {row.cadenceLabel}
                  </span>
                </>
              ) : (
                `${row.text} · ${row.cadenceLabel}`
              )}
            </p>
            {/* z-1, not higher: the sticky header is z-10 and the button must scroll under it */}
            <div className="relative z-1 col-start-3 row-span-2 row-start-1">
              <MarkContactedButton contactId={row.id} name={row.name} returnTo="/" compact />
            </div>
          </li>
        ))}
      </ul>

      {(view.canExpand || view.expanded) && (
        <div
          data-js-only=""
          className={
            view.expanded
              ? `flex flex-wrap items-center justify-between gap-controls border-t border-line ${edgePadding} py-2.5 max-[560px]:flex-col`
              : `border-t border-line ${edgePadding} py-1`
          }
        >
          {view.showPager && (
            <nav className="flex items-center gap-controls" aria-label="Страницы блока «Пора связаться»">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Назад"
                disabled={view.page <= 1}
                onClick={() => setState({ expanded: true, page: view.page - 1 })}
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
                onClick={() => setState({ expanded: true, page: view.page + 1 })}
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
            className={view.expanded ? "ml-auto text-teal-deep hover:text-ink max-[560px]:ml-0" : "text-teal-deep hover:text-ink"}
            onClick={() => setState(view.expanded ? { expanded: false, page: 1 } : { expanded: true, page: 1 })}
          >
            {view.expanded ? "Свернуть" : `Показать все (${rows.length})`}
            {view.expanded ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </div>
      )}
    </section>
  );
}
