// Which rows of the "Пора связаться" block are visible. Pure, so the rules are tested without a browser.

export const COLLAPSED_ROWS = 5;
export const PAGE_ROWS = 10;

export type BlockState = { expanded: boolean; page: number };

export function blockView(total: number, state: BlockState) {
  // With 5 rows or fewer there is nothing to expand: the block shows them all and drops the controls
  const expanded = state.expanded && total > COLLAPSED_ROWS;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_ROWS));
  // A page that emptied after "Связались" falls back to the last one
  const page = expanded ? Math.min(Math.max(1, Math.trunc(state.page) || 1), pageCount) : 1;

  return {
    expanded,
    page,
    pageCount,
    from: expanded ? (page - 1) * PAGE_ROWS : 0,
    to: expanded ? page * PAGE_ROWS : COLLAPSED_ROWS,
    canExpand: !expanded && total > COLLAPSED_ROWS,
    showPager: expanded && total > PAGE_ROWS,
  };
}
