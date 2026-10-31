import * as React from "react";
import { cn } from "@/lib/utils";

// Look of a single-line field, shared with the native select: pill on surface, teal focus outline,
// invalid = danger border on danger-soft and danger focus
const fieldClasses = cn(
  "w-full min-w-0 rounded-pill border border-input bg-surface px-5 py-[13px] font-sans text-field font-normal text-ink transition-colors outline-none placeholder:text-muted-foreground hover:border-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  // outline-none above turns the outline style off, so focus sets it back to solid
  "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring focus-visible:outline-solid",
  "aria-invalid:border-destructive aria-invalid:bg-danger-soft aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:outline-destructive",
);

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldClasses, className)} {...props} />;
}

export { Input, fieldClasses };
