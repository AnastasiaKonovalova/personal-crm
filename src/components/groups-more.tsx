"use client";

import { useEffect, useId, useRef } from "react";
import { pluralize } from "@/lib/plural";
import { cn } from "@/lib/utils";

type Group = { id: string; name: string };

const OPEN_DELAY_MS = 150;
const CLOSE_DELAY_MS = 250;
const EDGE_PX = 16;

// «+N» with the rest of the groups (design.md п.7). The native popover opens on click, tap and Enter and
// closes on Escape and outside clicks with or without JavaScript. The script adds hover for a mouse and puts
// the popover under the badge, right edges aligned; without it the popover is centred (m-auto: preflight
// zeroes the browser's own margin: auto).
// `relative` puts the badge above the row link's ::after (later in the DOM). No z-index: see confirm-dialog
export function GroupsMore({ hidden, className }: { hidden: Group[]; className: string }) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const label = `Ещё ${pluralize(hidden.length, ["группа", "группы", "групп"])}`;

  useEffect(() => {
    const button = buttonRef.current;
    const popover = popoverRef.current;
    if (!button || !popover) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const isOpen = () => popover.matches(":popover-open");
    const later = (action: () => void, delay: number) => {
      clearTimeout(timer);
      timer = setTimeout(action, delay);
    };
    const open = () => {
      if (!isOpen()) popover.showPopover();
    };
    const close = () => {
      if (isOpen()) popover.hidePopover();
    };

    const onBeforeToggle = (event: Event) => {
      if ((event as ToggleEvent).newState !== "open") return;
      const rect = button.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      popover.style.inset = "auto";
      popover.style.margin = "0";
      popover.style.top = `${rect.bottom + 8}px`;
      popover.style.right = `${Math.max(EDGE_PX, viewport - rect.right)}px`;
    };
    // A popover wider than the space left of the badge would leave the screen: pin it to the left edge
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "open") {
        if (popover.getBoundingClientRect().left < EDGE_PX) {
          popover.style.right = "auto";
          popover.style.left = `${EDGE_PX}px`;
        }
        addEventListener("scroll", close, { passive: true });
      } else {
        popover.style.left = "";
        removeEventListener("scroll", close);
      }
    };
    const onButtonEnter = (event: PointerEvent) => {
      if (event.pointerType === "mouse") later(open, OPEN_DELAY_MS);
    };
    const onButtonLeave = (event: PointerEvent) => {
      if (event.pointerType === "mouse") later(() => !popover.matches(":hover") && close(), CLOSE_DELAY_MS);
    };
    const onPopoverEnter = () => clearTimeout(timer);
    const onPopoverLeave = (event: PointerEvent) => {
      if (event.pointerType === "mouse") later(() => !button.matches(":hover") && close(), CLOSE_DELAY_MS);
    };

    popover.addEventListener("beforetoggle", onBeforeToggle);
    popover.addEventListener("toggle", onToggle);
    button.addEventListener("pointerenter", onButtonEnter);
    button.addEventListener("pointerleave", onButtonLeave);
    popover.addEventListener("pointerenter", onPopoverEnter);
    popover.addEventListener("pointerleave", onPopoverLeave);
    return () => {
      clearTimeout(timer);
      removeEventListener("scroll", close);
      popover.removeEventListener("beforetoggle", onBeforeToggle);
      popover.removeEventListener("toggle", onToggle);
      button.removeEventListener("pointerenter", onButtonEnter);
      button.removeEventListener("pointerleave", onButtonLeave);
      popover.removeEventListener("pointerenter", onPopoverEnter);
      popover.removeEventListener("pointerleave", onPopoverLeave);
    };
  }, []);

  return (
    <>
      {/* ::before grows the hit area to 44px; the border marks it open while its popover (next sibling) is */}
      <button
        ref={buttonRef}
        type="button"
        popoverTarget={id}
        popoverTargetAction="show"
        aria-label={label}
        className={cn(
          "relative flex-none cursor-pointer rounded-pill border border-line bg-surface px-[9px] py-0.5 font-display text-pill font-semibold tracking-normal text-teal-deep transition-colors duration-200 before:absolute before:-inset-x-1 before:-inset-y-[9px] before:content-[''] hover:border-teal-deep motion-reduce:transition-none [&:has(+:popover-open)]:border-teal-deep",
          className,
        )}
      >
        {`+${hidden.length}`}
      </button>
      <div
        ref={popoverRef}
        id={id}
        popover="auto"
        role="dialog"
        aria-label="Остальные группы"
        className="m-auto w-max max-w-[min(300px,calc(100vw-32px))] min-w-[180px] gap-2 rounded-card border border-line bg-surface px-[18px] py-3.5 text-ink open:grid"
      >
        <p className="font-display text-badge text-muted-foreground uppercase">{label}</p>
        <ul className="grid gap-1.5">
          {hidden.map((group) => (
            <li key={group.id} className="text-meta [overflow-wrap:anywhere]">
              {group.name}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
