import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

// Brand fonts; globals.css maps them to font-display / font-sans.
// Variable woff2 from google/fonts (SIL OFL, see fonts/OFL-*.txt), subset to latin + cyrillic
const wixMadeforDisplay = localFont({
  src: "./fonts/WixMadeforDisplay.woff2",
  weight: "400 800",
  variable: "--font-wix-madefor-display",
});
const manrope = localFont({
  src: "./fonts/Manrope.woff2",
  weight: "400 800",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Личная CRM",
  description: "Контакты людей, которых знаю лично",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the script below adds data-js to <html> before React sees it
    <html lang="ru" className={`${wixMadeforDisplay.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        {/* Marks a working JavaScript before the first paint; globals.css hides the JS-only
            controls without it and trims the "Пора связаться" block only with it */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.setAttribute('data-js','')" }} />
      </head>
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
