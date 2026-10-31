import { CadenceForm } from "@/components/cadence-form";
import { DueDot } from "@/components/due-dot";
import { MarkContactedButton } from "@/components/mark-contacted-button";
import { formatDueDate, pluralDays, type Status } from "@/lib/keep-in-touch";
import { cn } from "@/lib/utils";

// «Связь» in the contact card: the term, «Связались» and the frequency form
export function KeepInTouchCard({
  contactId,
  cadence,
  contactOn,
  dueOn,
  status,
  className,
}: {
  contactId: string;
  cadence: string | null;
  contactOn: string | null;
  dueOn: string | null;
  status: Status | null;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-controls", className)} aria-label="Связь с контактом">
      <div className="flex flex-wrap items-center justify-between gap-grid">
        <div className="grid gap-0.5">
          {status && dueOn ? (
            status.kind === "overdue" ? (
              <>
                <p className="flex items-center gap-2.5 font-display text-status font-semibold text-ink">
                  <DueDot kind="overdue" />
                  Пора связаться
                </p>
                <p className="text-meta font-semibold text-danger">просрочено на {pluralDays(status.days)}</p>
              </>
            ) : (
              <p className="flex items-center gap-2.5 font-display text-status font-semibold text-ink">
                <DueDot kind={status.kind} />
                Следующий раз — до {formatDueDate(dueOn)}
              </p>
            )
          ) : (
            <p className="text-muted-foreground">Выбери, как часто хочешь общаться</p>
          )}
        </div>
        <MarkContactedButton contactId={contactId} returnTo="card" />
      </div>
      <CadenceForm contactId={contactId} cadence={cadence} contactOn={contactOn} />
    </section>
  );
}
