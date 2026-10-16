import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid justify-items-start gap-4">
      <h1 className="text-2xl font-semibold">Не нашлось</h1>
      <p className="text-muted-foreground">Такого контакта или страницы нет.</p>
      <Button asChild variant="outline">
        <Link href="/">К списку контактов</Link>
      </Button>
    </div>
  );
}
