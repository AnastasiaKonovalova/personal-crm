import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

// shadcn/ui (new-york-v4) button with variants inlined instead of class-variance-authority.
// Styled after the design system: pills, Manrope 700, springy 3px lift, teal focus and hover.
// default = the one primary action per view (ink on gold, 5.1:1); outline = secondary;
// ghost = quiet text action; icon = round arrow (pagination).

const baseClasses =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-button-icon rounded-pill border border-transparent font-sans text-button font-bold whitespace-nowrap transition-[transform,background-color,border-color,color] duration-[350ms] ease-spring outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring focus-visible:outline-solid disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-40 motion-reduce:transition-none motion-reduce:hover:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5";

const variantClasses = {
  default: "bg-primary text-primary-foreground hover:-translate-y-[3px] hover:bg-accent-deep",
  destructive: "bg-destructive text-surface hover:-translate-y-[3px]",
  outline:
    "border-border bg-surface text-ink hover:-translate-y-[3px] hover:border-teal-deep hover:text-teal-deep",
  secondary: "bg-secondary text-secondary-foreground hover:-translate-y-[3px]",
  ghost: "bg-transparent text-muted-foreground hover:text-teal-deep",
  link: "bg-transparent text-teal-deep underline-offset-4 hover:underline",
} as const;

const sizeClasses = {
  default: "px-6 py-[13px]",
  sm: "px-4 py-[7px] text-nav [&_svg:not([class*='size-'])]:size-4",
  lg: "px-7 py-4",
  icon: "size-hit-carousel border-border bg-surface p-0 text-ink hover:translate-y-0 hover:scale-108 hover:border-teal-deep hover:text-teal-deep motion-reduce:hover:scale-100",
} as const;

type ButtonVariantProps = {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
  className?: string;
};

function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: ButtonVariantProps = {}) {
  return cn(baseClasses, variantClasses[variant], sizeClasses[size], className);
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & ButtonVariantProps & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
}

export { Button, buttonVariants };
