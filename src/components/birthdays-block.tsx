"use client";

import { useState } from "react";
import Link from "next/link";
import { Cake } from "lucide-react";
import { BlockFooter } from "@/components/block-footer";
import { DueDot } from "@/components/due-dot";
import { blockView, type BlockState } from "@/lib/reminders-view";

export type BirthdayBlockRow = {
  id: string;
  name: string;
  // -1 yesterday, 0 today, then days ahead
  days: number;
  // Ready-made on the server (birthdayRow): "Сегодня", "22 ноября", "исполняется 36" or null
  when: string;
  date: string;
  age: string | null;
};

const edgePadding = "px-[clamp(18px,2.4vw,28px)]";

// The "Скоро день рождения" block, on the same mechanism as "Пора связаться": the server sends every
// row, this component only decides which are shown (data-row-out, hidden by CSS only with JavaScript).
// The page renders it only when someone is in the window: the block has no empty state.
export function BirthdaysBlock({ rows }: { rows: BirthdayBlockRow[] }) {
  const [state, setState] = useState<BlockState>({ expanded: false, page: 1 });
  const view = blockView(rows.length, state);

  return (
    <section
      className="overflow-hidden rounded-card border border-line bg-surface"
      aria-labelledby="birthdays-title"
    >
      <div
        className={`flex items-baseline gap-cta ${edgePadding} pt-[clamp(18px,2.4vw,24px)] pb-3`}
      >
        <h2
          id="birthdays-title"
          className="inline-flex items-center gap-2.5 font-display text-notes-title font-semibold"
        >
          <Cake className="size-5.5 text-teal-deep" aria-hidden="true" />
          Скоро день рождения
        </h2>
        <span className="font-display text-counter font-semibold text-muted-foreground">
          {rows.length}
        </span>
      </div>

      <ul>
        {rows.map((row, index) => (
          <li
            key={row.id}
            data-row-out={index < view.from || index >= view.to ? "" : undefined}
            className={`group relative grid grid-cols-[8px_minmax(0,1fr)] items-center gap-x-grid gap-y-0.5 border-t border-line ${edgePadding} py-3 transition-colors duration-200 hover:bg-teal-soft`}
          >
            {/* decision 39: yesterday as overdue, today as soon; "Вчера" / "Сегодня" in the text says it */}
            <span className="col-start-1 row-start-1 flex">
              <DueDot kind={row.days < 0 ? "overdue" : row.days === 0 ? "soon" : null} />
            </span>
            {/* the link's ::after covers the whole row, so the row opens the card */}
            <Link
              href={`/contacts/${row.id}`}
              className="col-start-2 row-start-1 font-bold text-ink transition-colors duration-200 group-hover:text-teal-deep after:absolute after:inset-0 after:content-['']"
            >
              {row.name}
            </Link>
            <p className="col-start-2 row-start-2 text-meta text-muted-foreground">
              {[row.when, row.date, row.age].filter(Boolean).join(" · ")}
            </p>
          </li>
        ))}
      </ul>

      <BlockFooter view={view} total={rows.length} title="Скоро день рождения" onChange={setState} />
    </section>
  );
}
