// Address and counter of the main contact list: the state lives in ?q=, ?group= and ?page= (design.md п.8)

export function contactsHref({ query, groupId, page }: { query?: string; groupId?: string; page?: number }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (groupId) params.set("group", groupId);
  if (page && page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

// Address of the group page (design.md п.12): the group is in the path, search and page in ?q= and ?page=
export function groupPageHref({ groupId, query, page }: { groupId: string; query?: string; page?: number }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page && page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/groups/${groupId}?${search}` : `/groups/${groupId}`;
}

// «Найдено» whenever the list is narrowed: by search or by a group filter
export function listCaption({ total, query, filtered }: { total: number; query: string; filtered: boolean }) {
  return query || filtered ? `Найдено: ${total}` : `Всего: ${total}`;
}
