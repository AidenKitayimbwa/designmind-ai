import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import Logo from "@/components/Logo";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-atkinson" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });

export const metadata: Metadata = {
  title: "DesignMind AI",
  description: "Upload screens of your product. 6 AI reviewers check the visuals, usability, accessibility and market, then mark up your design with the fixes that matter most.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f5f6f8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. LanguageTool) add attributes to <html> before React loads.
    // It only silences attribute differences on this element, not in the rest of the page.
    <html lang="en" className={`${atkinson.variable} ${bricolage.variable}`} suppressHydrationWarning>
      <body className="min-h-screen">
        <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-4 focus:py-3 focus:text-white">
          Skip to content
        </a>
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="flex min-h-11 items-center gap-2 font-display text-lg font-bold tracking-tight text-ink">
              <Logo size={34} />
              DesignMind AI
            </Link>
            <Link href="/examples/example-compare" className="flex min-h-11 items-center rounded-md px-3 font-semibold text-ink underline decoration-pen decoration-2 underline-offset-4 hover:bg-paper">
              See an example
            </Link>
          </div>
        </header>
        <main id="content" className="mx-auto max-w-[1200px] px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
          {children}
        </main>
      </body>
    </html>
  );
}
