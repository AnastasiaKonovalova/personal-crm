import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Brand fonts; globals.css maps them to font-display / font-sans
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
});
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Личная CRM",
  description: "Контакты людей, которых знаю лично",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${spaceGrotesk.variable} ${manrope.variable}`}>
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
