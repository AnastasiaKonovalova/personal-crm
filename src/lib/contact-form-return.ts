// Where «Отмена» and «Все контакты» of the new-contact form lead: the group page it was opened from
// (/contacts/new?group=<id> with an existing group), otherwise the main page
export function newContactReturnHref(group: { id: string } | null | undefined): string {
  return group ? `/groups/${group.id}` : "/";
}
