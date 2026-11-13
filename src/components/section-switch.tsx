import Link from "next/link";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "contacts", href: "/", label: "Контакты" },
  { key: "groups", href: "/groups", label: "Группы" },
] as const;

type Section = (typeof SECTIONS)[number]["key"];

// «Контакты / Группы» switch: LangSwitch pattern (pill group, the current section gold with ink).
// «Контакты» always leads to the plain list, without search or filter
export function SectionSwitch({ current }: { current: Section }) {
  return (
    <nav
      aria-label="Разделы"
      className="inline-flex gap-chip justify-self-start rounded-pill border border-line bg-surface p-1"
    >
      {SECTIONS.map((section) => {
        const isCurrent = section.key === current;
        return (
          <Link
            key={section.key}
            href={section.href}
            aria-current={isCurrent ? "page" : undefined}
            className={cn(
              "rounded-pill px-5 py-2 text-button font-bold transition-colors duration-200",
              isCurrent ? "bg-primary text-ink" : "text-muted-foreground hover:text-teal-deep",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
