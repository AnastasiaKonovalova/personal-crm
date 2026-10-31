import { cn } from "@/lib/utils";

// Status dot of "keep in touch". Always takes its 8px slot, so names in a list do not jump
// between rows with and without a status. Pulse stops under prefers-reduced-motion.
export function DueDot({ kind }: { kind?: "overdue" | "soon" | "ok" | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-round motion-reduce:animate-none",
        kind === "overdue" && "animate-due-overdue bg-overdue",
        kind === "soon" && "animate-due-soon bg-teal",
      )}
    />
  );
}

// What the dot says to a screen reader; nothing for a contact that is fine or has no cadence
export function DueDotLabel({ kind }: { kind?: "overdue" | "soon" | "ok" | null }) {
  if (kind === "overdue") return <span className="sr-only">, пора связаться</span>;
  if (kind === "soon") return <span className="sr-only">, скоро пора связаться</span>;
  return null;
}
