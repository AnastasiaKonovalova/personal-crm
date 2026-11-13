// Empty state of the contact list: nobody at all, nobody in the group, or nothing found by search.
// The group page adds a hint under an empty group (mockup group-empty.html)
export function EmptyList({ query, inGroup, hint }: { query: string; inGroup: boolean; hint?: string }) {
  const title = query
    ? `По запросу «${query}» никого не нашлось`
    : inGroup
      ? "В группе пока никого нет"
      : "Контактов пока нет";

  return (
    <div className="rounded-contact border border-line bg-surface bg-[radial-gradient(circle_at_85%_0,var(--accent-soft),transparent_55%)] px-[clamp(24px,4vw,48px)] py-[clamp(36px,5vw,64px)] text-center">
      <h2 className="mx-auto max-w-[22ch] font-display text-empty-title font-semibold">{title}</h2>
      {query ? (
        <p className="mx-auto mt-3.5 max-w-[44ch] text-muted-foreground">
          Проверь написание или поищи по части имени. Регистр, «е» и «ё» не важны.
        </p>
      ) : (
        inGroup && hint && <p className="mx-auto mt-3.5 max-w-[44ch] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
