import Link from "next/link";
import { X } from "lucide-react";
import { removeContactFromGroupAction } from "@/app/contacts/actions";
import { AddToGroupForm } from "@/components/add-to-group-form";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { groupsToAdd } from "@/lib/card-groups";

type Group = { id: string; name: string };

type ContactGroupsCardProps = {
  className: string;
  contact: { id: string; name: string };
  // The contact's groups, by name
  groups: Group[];
  // All groups, by name
  allGroups: Group[];
  // ?removeGroup=<id> of the card: that group's dialog is open on load
  removeGroupId?: string;
};

const focusClasses =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring focus-visible:outline-solid";

// The 32px cross gets a 44px hit area from ::before. No z-index here: it would trap the no-JS dialog
// under the neighbouring elements (see the groups page)
const removeClasses = `relative grid size-8 flex-none place-items-center rounded-round text-muted-foreground transition-colors duration-200 before:absolute before:-inset-1.5 before:content-[''] hover:bg-teal-soft hover:text-teal-deep motion-reduce:transition-none ${focusClasses}`;

// «Группы» in the contact card (design.md п.5, mockups contact-groups-a.html and contact-groups-none.html):
// pills by name leading to the group page, a cross with a confirmation, and one field to add
export function ContactGroupsCard({ className, contact, groups, allGroups, removeGroupId }: ContactGroupsCardProps) {
  const cardHref = `/contacts/${contact.id}`;

  return (
    // grid-cols-1 (minmax(0, 1fr)): a long group name must truncate, not widen the card on a narrow screen
    <section className={`${className} grid grid-cols-1 gap-controls`} aria-labelledby="groups-title">
      <h2 id="groups-title" className="font-display text-badge text-muted-foreground uppercase">
        Группы
      </h2>
      {groups.length === 0 ? (
        <p className="text-muted-foreground">Ни в одной группе</p>
      ) : (
        <ul className="flex flex-wrap gap-tag">
          {groups.map((group) => (
            <li key={group.id} className="inline-flex max-w-full items-center rounded-pill bg-surface-2 pr-0.5 pl-3.5">
              <Link
                href={`/groups/${group.id}`}
                title={group.name}
                className={`min-w-0 truncate rounded-pill py-1.5 pr-0.5 text-nav font-semibold text-ink transition-colors duration-200 hover:text-teal-deep motion-reduce:transition-none ${focusClasses}`}
              >
                {group.name}
              </Link>
              <ConfirmDialog
                triggerHref={`${cardHref}?removeGroup=${group.id}`}
                triggerLabel={`Убрать из группы «${group.name}»`}
                triggerClassName={removeClasses}
                closeHref={cardHref}
                initiallyOpen={group.id === removeGroupId}
                title={`Убрать из группы «${group.name}»?`}
                description={`${contact.name} останется в остальных группах, сама группа не удалится.`}
                confirmLabel="Убрать"
                pendingLabel="Убираю…"
                action={removeContactFromGroupAction}
                fields={{ contactId: contact.id, groupId: group.id }}
              >
                <X aria-hidden="true" className="size-4" />
              </ConfirmDialog>
            </li>
          ))}
        </ul>
      )}
      <AddToGroupForm contactId={contact.id} suggestions={groupsToAdd(allGroups, groups)} />
    </section>
  );
}
