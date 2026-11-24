// Where a block button without JavaScript sends the browser back to: only the pages that show the
// blocks - the main page, the main page filtered by a group, a group page. The value comes from the
// form, so anything else (another site, another page, extra parameters) falls back to the main page
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const BLOCK_PAGE = new RegExp(`^/(?:\\?group=${UUID}|groups/${UUID})?$`, "i");

export function blockReturnTo(value: string): string {
  return BLOCK_PAGE.test(value) ? value : "/";
}
