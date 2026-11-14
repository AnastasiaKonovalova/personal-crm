import { GroupsMore } from "@/components/groups-more";
import { layoutRowGroups } from "@/lib/row-groups";
import { cn } from "@/lib/utils";

type Group = { id: string; name: string };

// Groups cell of a list row (design.md п.6, mockup contacts-groups.html). The markup has the first
// three groups and one «+N» per layout: above 1100px three chips, 1100px and narrower one chip that may
// fill the column (up to 16em on a phone, where it is its own line). CSS shows what the width needs.
// Chips are not links: the row link's ::after covers them, so a click opens the card
export function RowGroups({ groups }: { groups: Group[] }) {
  const layout = layoutRowGroups(groups);

  return (
    <span className="flex min-w-0 items-center gap-chip max-[680px]:col-start-1 max-[680px]:mt-1.5 max-[680px]:pl-[18px] max-[680px]:empty:hidden">
      {layout.rendered.map((group, index) => (
        <span
          key={group.id}
          data-group-chip=""
          title={group.name}
          className={cn(
            "max-w-[9em] min-w-[4.5em] flex-[0_1_auto] truncate rounded-pill bg-surface-2 px-2.5 py-[3px] font-display text-pill tracking-normal text-muted-foreground max-[1100px]:max-w-none max-[680px]:max-w-[16em]",
            index > 0 && "max-[1100px]:hidden",
          )}
        >
          {group.name}
        </span>
      ))}
      {layout.wide.more && (
        <GroupsMore hidden={layout.wide.more.hidden} className="max-[1100px]:hidden" />
      )}
      {layout.compact.more && (
        <GroupsMore
          hidden={layout.compact.more.hidden}
          className="hidden max-[1100px]:inline-block"
        />
      )}
    </span>
  );
}
