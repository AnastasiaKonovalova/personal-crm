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
  title: "Свои люди — личная CRM",
  description: "Контакты людей, которых знаю лично",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the script below adds data-js to <html> before React sees it
    <html
      lang="ru"
      className={`${wixMadeforDisplay.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Marks a working JavaScript before the first paint; globals.css hides the JS-only
            controls without it and trims the "Пора связаться" block only with it.
            A raw <script> on purpose: next/script with beforeInteractive only queues an inline script
            (self.__next_s) and runs it after Next's bundles load - after the first paint, so JS-only
            controls would flash. React's dev warning "Encountered a script tag" is harmless here */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.setAttribute('data-js','')",
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-line bg-header-glass backdrop-blur-[10px]">
          <div className="mx-auto flex h-header-height max-w-content items-center px-gutter-fluid">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 font-display text-brand font-semibold whitespace-nowrap"
            >
              {/* Landing mark: gold circle and teal-deep ring; the same shape as app/icon.svg */}
              <svg
                viewBox="0 0 38 28"
                width="33"
                height="24"
                aria-hidden="true"
                className="flex-none"
              >
                <circle cx="14" cy="14" r="12" className="fill-accent" />
                <circle
                  cx="24"
                  cy="14"
                  r="11"
                  fill="none"
                  strokeWidth="2.4"
                  className="stroke-teal-deep"
                />
              </svg>
              {/* name and dot in one element, so the gap does not push the dot away */}
              <span>
                Свои люди<span className="text-accent">.</span>
              </span>
            </Link>
            {/* footnote, desktop only: on a phone it stays in the tab title */}
            <span className="ml-3.5 border-l border-line pl-3.5 text-caption whitespace-nowrap text-muted-foreground max-[680px]:hidden">
              личная CRM
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
