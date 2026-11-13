import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CreateGroupForm, RenameGroupForm } from "@/components/group-forms";
import { PageShell } from "@/components/page-shell";
import { SectionSwitch } from "@/components/section-switch";
import { buttonVariants } from "@/components/ui/button";
import { pluralContacts } from "@/lib/plural";
import { deleteGroupAction } from "@/app/groups/actions";
import { listGroups } from "@/server/groups";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Text buttons of a row; at 560px and below only the icon stays, in a 44px round hit area
const rowActionClasses = buttonVariants({
  variant: "ghost",
  size: "sm",
  className:
    "px-0 max-[560px]:size-hit-carousel max-[560px]:justify-center max-[560px]:gap-0 max-[560px]:p-0",
});

function deleteDescription(contactCount: number) {
  if (contactCount === 0) return "В группе пока никого нет.";
  const verb = contactCount % 10 === 1 && contactCount % 100 !== 11 ? "останется" : "останутся";
  return `${pluralContacts(contactCount)} ${verb}, только без этой группы.`;
}

export default async function GroupsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const editId = typeof params.edit === "string" ? params.edit : undefined;
  const deleteId = typeof params.delete === "string" ? params.delete : undefined;

  const groups = await listGroups();

  return (
    <PageShell aurora className="grid gap-heading">
      <div>
        <p className="mb-3.5 inline-flex items-center gap-3 font-display text-eyebrow text-muted-foreground uppercase before:h-0.5 before:w-rule-label before:rounded-pill before:bg-teal before:content-['']">
          {`Всего: ${groups.length}`}
        </p>
        <h1 className="font-display text-page-title font-semibold">Группы</h1>
      </div>

      <SectionSwitch current="groups" />

      {/* keyed by the edit mode: opening or closing a rename remounts the form, so its old error goes away */}
      <CreateGroupForm
        key={editId ?? "list"}
        className="rounded-card border border-line bg-surface p-[clamp(22px,2.6vw,30px)]"
      />

      {groups.length === 0 ? (
        <div className="rounded-contact border border-line bg-surface bg-[radial-gradient(circle_at_85%_0,var(--accent-soft),transparent_55%)] px-[clamp(24px,4vw,48px)] py-[clamp(36px,5vw,64px)] text-center">
          <h2 className="mx-auto max-w-[22ch] font-display text-empty-title font-semibold">
            Групп пока нет
          </h2>
          <p className="mx-auto mt-3.5 max-w-[44ch] text-muted-foreground">
            Создай первую — например, «Семья» или «Теннис». Людей в группы добавляют в их карточке.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {groups.map((group) =>
            group.id === editId ? (
              <li key={group.id}>
                <RenameGroupForm group={group} />
              </li>
            ) : (
              <li
                key={group.id}
                className="group relative grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-grid border-b border-line px-[clamp(18px,2.4vw,28px)] py-2.5 transition-colors duration-200 last:border-b-0 hover:bg-teal-soft has-[>a:focus-visible]:bg-teal-soft max-[560px]:grid-cols-[minmax(0,1fr)_auto] max-[560px]:gap-x-cta max-[560px]:gap-y-0"
              >
                {/* the name link covers the whole row; the actions come later in the DOM, so they sit above it.
                    No z-index on them: it would trap the no-JS dialog inside this row's stacking context */}
                <Link
                  href={`/groups/${group.id}`}
                  className="font-bold [overflow-wrap:anywhere] text-ink transition-colors duration-200 group-hover:text-teal-deep after:absolute after:inset-0 focus-visible:text-teal-deep focus-visible:outline-offset-[-2px] max-[560px]:col-start-1"
                >
                  {group.name}
                </Link>
                <span className="font-display text-counter font-semibold whitespace-nowrap text-muted-foreground max-[560px]:col-start-1 max-[560px]:row-start-2">
                  {pluralContacts(group.contactCount)}
                </span>
                <div className="relative flex gap-1 max-[560px]:col-start-2 max-[560px]:row-span-2 max-[560px]:row-start-1">
                  <Link
                    href={`/groups?edit=${group.id}`}
                    scroll={false}
                    aria-label={`Переименовать «${group.name}»`}
                    className={rowActionClasses}
                  >
                    <Pencil aria-hidden="true" />
                    <span className="max-[560px]:hidden">Переименовать</span>
                  </Link>
                  <ConfirmDialog
                    triggerHref={`/groups?delete=${group.id}`}
                    triggerLabel={`Удалить «${group.name}»`}
                    triggerClassName={rowActionClasses}
                    closeHref="/groups"
                    initiallyOpen={group.id === deleteId}
                    title={`Удалить группу «${group.name}»?`}
                    description={deleteDescription(group.contactCount)}
                    confirmLabel="Удалить"
                    pendingLabel="Удаляю…"
                    action={deleteGroupAction}
                    fields={{ groupId: group.id }}
                  >
                    <Trash2 aria-hidden="true" />
                    <span className="max-[560px]:hidden">Удалить</span>
                  </ConfirmDialog>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </PageShell>
  );
}
