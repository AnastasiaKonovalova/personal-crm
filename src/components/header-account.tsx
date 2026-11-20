import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

// Right side of the header after sign-in (mockups header-account*.html, decision 36): the email, cut with
// an ellipsis (full address in title), and «Выйти» as a form, so it works without JavaScript.
// At 560px and below «Выйти» is a 44px icon (the name stays in aria-label) and the gaps get tighter
export function HeaderAccount({ email }: { email: string }) {
  return (
    <div className="ml-auto flex min-w-0 items-center gap-cta pl-3 max-[560px]:gap-1">
      <span
        title={email}
        className="max-w-[300px] min-w-0 truncate text-nav text-muted-foreground max-[560px]:text-caption"
      >
        {email}
      </span>
      <form action={signOutAction} className="flex-none">
        <Button
          type="submit"
          variant="ghost"
          aria-label="Выйти"
          title="Выйти"
          className="min-h-hit-carousel px-1 py-0 text-nav max-[560px]:w-hit-carousel max-[560px]:gap-0 max-[560px]:p-0 [&_svg:not([class*='size-'])]:size-[18px] max-[560px]:[&_svg:not([class*='size-'])]:size-5"
        >
          <LogOut aria-hidden="true" />
          <span className="max-[560px]:hidden">Выйти</span>
        </Button>
      </form>
    </div>
  );
}
