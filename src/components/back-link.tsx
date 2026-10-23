import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// "‹ Back" text link above the page title
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="px-0">
        <Link href={href}>
          <ChevronLeft />
          {children}
        </Link>
      </Button>
    </div>
  );
}
