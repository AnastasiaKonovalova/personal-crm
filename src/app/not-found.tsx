import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageShell width="narrow" className="grid justify-items-start gap-heading">
      <h1 className="font-display text-page-title font-semibold">Не нашлось</h1>
      <p className="text-muted-foreground">Такого контакта или страницы нет.</p>
      <Button asChild variant="outline">
        <Link href="/">К списку контактов</Link>
      </Button>
    </PageShell>
  );
}
