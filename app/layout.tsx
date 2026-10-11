import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Atkinson_Hyperlegible, Manrope } from "next/font/google";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-atkinson" });
const manrope = Manrope({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "DesignMind AI",
  description: "Upload screens of your product. 6 AI reviewers check the visuals, usability, accessibility and market, then mark up your design with the fixes that matter most.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fef8ec" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. LanguageTool) add attributes to <html> before React loads.
    // It only silences attribute differences on this element, not in the rest of the page.
    <html lang="en" className={`${atkinson.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body className="min-h-screen">
        <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-4 focus:py-3 focus:text-white">
          Skip to content
        </a>
        <header className="border-b border-line bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75 sticky top-0 z-40">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">
            <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap font-display text-base font-bold tracking-tight text-ink sm:text-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.png" alt="" width={36} height={36} className="size-9" />
              DesignMind AI
            </Link>
            <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
              <Link href="/examples/example-compare" className="flex min-h-11 items-center whitespace-nowrap rounded-md px-2 text-sm font-semibold text-ink hover:bg-pen-soft sm:px-3 sm:text-base">
                Quick Walk-through
              </Link>
              <Link href="/#start" className="hidden min-h-11 items-center rounded-full bg-ink px-5 font-semibold text-paper hover:bg-navy sm:flex">
                Start a review
              </Link>
            </nav>
          </div>
        </header>
        <main id="content" className="mx-auto max-w-[1200px] px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 px-4 py-10 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-full.jpg" alt="DesignMind AI" width={200} height={125} className="h-auto w-40" />
            <div className="max-w-md text-sm text-muted">
              <p className="font-display text-base font-semibold text-ink">Multimodal AI Design Analysis Suite</p>
              <p className="mt-1">Autonomous visual evaluation, heuristic critique and live market benchmarking for product teams.</p>
              <p className="mt-2">AI Engineering Accelerator C10 Hackathon 2026</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
