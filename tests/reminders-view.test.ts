import { describe, expect, it } from "vitest";
import { blockView } from "@/lib/reminders-view";

const collapsed = { expanded: false, page: 1 };

describe("blockView", () => {
  it("shows the first 5 and offers to expand when there are more", () => {
    const view = blockView(8, collapsed);
    expect(view).toMatchObject({ expanded: false, from: 0, to: 5, canExpand: true, showPager: false });
  });

  it("shows 10 per page when expanded, with a pager above 10", () => {
    const view = blockView(23, { expanded: true, page: 2 });
    expect(view).toMatchObject({ expanded: true, page: 2, pageCount: 3, from: 10, to: 20, showPager: true });
    expect(blockView(23, { expanded: true, page: 3 })).toMatchObject({ from: 20, to: 30 });
  });

  it("has no pager when all rows fit one expanded page", () => {
    expect(blockView(8, { expanded: true, page: 1 })).toMatchObject({ expanded: true, from: 0, to: 10, showPager: false });
  });

  it("drops the expansion and the controls when 5 rows or fewer are left", () => {
    const view = blockView(5, { expanded: true, page: 2 });
    expect(view).toMatchObject({ expanded: false, page: 1, from: 0, to: 5, canExpand: false, showPager: false });
    expect(blockView(3, collapsed)).toMatchObject({ canExpand: false, showPager: false });
  });

  it("pulls the page back to the last one when the current page emptied", () => {
    // 21 rows, page 3 holds one; after "Связались" there are 20 rows and two pages
    expect(blockView(20, { expanded: true, page: 3 })).toMatchObject({ page: 2, pageCount: 2, from: 10, to: 20 });
  });

  it("stays expanded on the same page when a row leaves a middle page", () => {
    expect(blockView(22, { expanded: true, page: 2 })).toMatchObject({ page: 2, pageCount: 3, from: 10, to: 20 });
  });

  it("handles an empty block", () => {
    expect(blockView(0, { expanded: true, page: 4 })).toMatchObject({ expanded: false, page: 1, canExpand: false, showPager: false });
  });
});
