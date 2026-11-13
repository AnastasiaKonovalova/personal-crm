// Suggestions of the card field «Группа: выбрать или новая»: the groups the contact is not in yet
export function groupsToAdd<T extends { id: string }>(all: T[], contactGroups: { id: string }[]): T[] {
  const member = new Set(contactGroups.map((group) => group.id));
  return all.filter((group) => !member.has(group.id));
}
