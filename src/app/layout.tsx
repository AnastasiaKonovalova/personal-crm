import type { Metadata } from "next";
import { Manrope, Wix_Madefor_Display } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Brand fonts; globals.css maps them to font-display / font-sans
const wixMadeforDisplay = Wix_Madefor_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-wix-madefor-display",
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
    <html lang="ru" className={`${wixMadeforDisplay.variable} ${manrope.variable}`}>
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-line bg-header-glass backdrop-blur-[10px]">
          <div className="mx-auto flex h-header-height max-w-content items-center px-gutter-fluid">
            <Link href="/" className="font-display text-brand font-semibold whitespace-nowrap">
              Личная CRM<span className="text-accent">.</span>
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
