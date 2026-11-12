// How many groups a list row shows per screen width (design.md p.6, decision 22 in design/README.md).
// The markup renders the first groups and one "+N" badge per width; CSS hides what a width does not need.

export const ROW_GROUP_LIMITS = { wide: 3, medium: 2, narrow: 1 } as const;

export type RowWidth = keyof typeof ROW_GROUP_LIMITS;

export type RowGroupsAtWidth<T> = {
  visible: T[];
  // null when every group fits
  more: { count: number; hidden: T[] } | null;
};

export type RowGroupsLayout<T> = Record<RowWidth, RowGroupsAtWidth<T>> & {
  // Groups to put in the markup: as many as the widest layout shows
  rendered: T[];
};

function atWidth<T>(groups: T[], limit: number): RowGroupsAtWidth<T> {
  const hidden = groups.slice(limit);
  return {
    visible: groups.slice(0, limit),
    more: hidden.length > 0 ? { count: hidden.length, hidden } : null,
  };
}

// `groups` must already be sorted by name
export function layoutRowGroups<T>(groups: T[]): RowGroupsLayout<T> {
  return {
    rendered: groups.slice(0, ROW_GROUP_LIMITS.wide),
    wide: atWidth(groups, ROW_GROUP_LIMITS.wide),
    medium: atWidth(groups, ROW_GROUP_LIMITS.medium),
    narrow: atWidth(groups, ROW_GROUP_LIMITS.narrow),
  };
}
