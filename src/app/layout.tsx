import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Личная CRM",
  description: "Контакты людей, которых знаю лично",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">
        <header className="border-b">
          <div className="mx-auto flex max-w-4xl items-center px-4 py-4">
            <Link href="/" className="font-semibold">
              Личная CRM
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
