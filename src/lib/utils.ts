import { extendTailwindMerge, type ClassNameValue } from "tailwind-merge";

// Design-token names from src/design-system/tokens.css. Without them tailwind-merge
// takes `text-button` for a colour and drops it next to `text-ink`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "page-title",
        "empty-title",
        "notes-title",
        "brand",
        "counter",
        "eyebrow",
        "kicker",
        "pill",
        "badge",
        "body-lg",
        "body",
        "meta",
        "field",
        "button",
        "nav",
        "caption",
      ],
      radius: ["pill", "burger", "stat", "card", "case", "contact", "photo", "round"],
      shadow: ["photo", "case-hover"],
      ease: ["spring", "slide"],
    },
  },
});

// shadcn/ui helper. tailwind-merge alone covers our usage (strings, arrays, falsy values),
// so clsx is not needed.
export function cn(...inputs: ClassNameValue[]) {
  return twMerge(...inputs);
}
