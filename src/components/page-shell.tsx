import { cn } from "@/lib/utils";

type PageShellProps = {
  width?: "wide" | "narrow";
  aurora?: boolean;
  className?: string;
  children: React.ReactNode;
};

// Page column under the header: wide (1180) for the list, narrow (760) for the card and forms.
// `aurora` puts the gold wash behind the page; only the list screens use it
export function PageShell({ width = "wide", aurora = false, className, children }: PageShellProps) {
  const main = (
    <main
      className={cn(
        "relative mx-auto w-full px-gutter-fluid pt-[clamp(28px,4vw,56px)] pb-[clamp(50px,7vw,96px)]",
        width === "wide" ? "max-w-content" : "max-w-narrow",
        className,
      )}
    >
      {children}
    </main>
  );

  if (!aurora) return main;

  return (
    <div className="relative overflow-hidden">
      <div className="aurora" aria-hidden="true" />
      {main}
    </div>
  );
}
