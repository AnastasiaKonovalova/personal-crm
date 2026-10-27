import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// Error under a field or above a form: icon + words, never colour alone (danger is as light as teal-deep)
export function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("flex items-center gap-1.5 text-caption font-semibold text-destructive", className)}
      {...props}
    >
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </p>
  );
}
