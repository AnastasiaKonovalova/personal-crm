import { CircleAlert } from "lucide-react";

// Error under a field: icon + words, never colour alone (danger is as light as teal-deep)
export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-caption font-semibold text-destructive">
      <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      {children}
    </p>
  );
}
