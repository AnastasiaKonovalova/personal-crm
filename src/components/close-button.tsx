import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Round 44px close button without a border (dialog, toast); teal-deep on teal-soft on hover
export function CloseButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label="Закрыть"
      className={cn(
        "flex size-hit-carousel shrink-0 cursor-pointer items-center justify-center rounded-round bg-transparent text-muted-foreground transition-colors duration-200 hover:bg-teal-soft hover:text-teal-deep motion-reduce:transition-none",
        className,
      )}
      {...props}
    >
      <X aria-hidden="true" className="size-5" />
    </button>
  );
}
