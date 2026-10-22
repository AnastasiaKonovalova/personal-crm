import * as React from "react";
import { cn } from "@/lib/utils";

// Single-line field: pill on surface, teal focus outline, invalid = danger border on danger-soft
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 rounded-pill border border-input bg-surface px-5 py-[13px] font-sans text-button font-normal text-ink transition-colors outline-none placeholder:text-muted-foreground hover:border-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring",
        "aria-invalid:border-destructive aria-invalid:bg-danger-soft",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
