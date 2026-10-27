import * as React from "react";
import { cn } from "@/lib/utils";

// Multi-line field: radius-card instead of a pill, otherwise the same states as Input
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-26 w-full resize-y rounded-card border border-input bg-surface px-5 py-3.5 font-sans text-field font-normal text-ink transition-colors outline-none placeholder:text-muted-foreground hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring focus-visible:outline-solid",
        "aria-invalid:border-destructive aria-invalid:bg-danger-soft aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:outline-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
