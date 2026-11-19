// Empty state of the contact list: nobody at all, nobody in the group, or nothing found by search.
// The group page adds a hint under an empty group (mockup group-empty.html); with no contacts at all
// the hint is «Добавь первый контакт» (mockup contacts-first.html, decision 37). No second gold button:
// «Добавить контакт» is already in the page head
const NO_CONTACTS_HINT = "Добавь первый контакт";

export function EmptyList({
  query,
  inGroup,
  hint,
}: {
  query: string;
  inGroup: boolean;
  hint?: string;
}) {
  const title = query
    ? `По запросу «${query}» никого не нашлось`
    : inGroup
      ? "В группе пока никого нет"
      : "Контактов пока нет";
  const text = query
    ? "Проверь написание или поищи по части имени. Регистр, «е» и «ё» не важны."
    : inGroup
      ? hint
      : NO_CONTACTS_HINT;

  return (
    <div className="rounded-contact border border-line bg-surface bg-[radial-gradient(circle_at_85%_0,var(--accent-soft),transparent_55%)] px-[clamp(24px,4vw,48px)] py-[clamp(36px,5vw,64px)] text-center">
      <h2 className="mx-auto max-w-[22ch] font-display text-empty-title font-semibold">{title}</h2>
      {text && <p className="mx-auto mt-3.5 max-w-[44ch] text-muted-foreground">{text}</p>}
    </div>
  );
}
