// Russian plural forms: one (1, 21), few (2-4, 22-24), many (0, 5-20, 25...)
export function pluralize(count: number, forms: [one: string, few: string, many: string]): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return `${count} ${forms[0]}`;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${count} ${forms[1]}`;
  return `${count} ${forms[2]}`;
}

// "1 контакт", "3 контакта", "12 контактов"
export function pluralContacts(count: number): string {
  return pluralize(count, ["контакт", "контакта", "контактов"]);
}
