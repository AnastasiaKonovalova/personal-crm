import { twMerge, type ClassNameValue } from "tailwind-merge";

// shadcn/ui helper. tailwind-merge alone covers our usage (strings, arrays, falsy values),
// so clsx is not needed.
export function cn(...inputs: ClassNameValue[]) {
  return twMerge(...inputs);
}
