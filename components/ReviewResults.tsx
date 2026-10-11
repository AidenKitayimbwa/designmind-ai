"use client";

import Link from "next/link";
import { useState } from "react";
import MarkedUpScreen from "./MarkedUpScreen";
import ResultsTabs from "./ResultsTabs";
import type { Review } from "@/lib/steps";

// Marked-up design, results tabs and the export buttons. Nothing downloads until a button is clicked.
export default function ReviewResults({ review }: { review: Review }) {
  const [exporting, setExporting] = useState(false);
  const top10 = (review.outputs.lead?.fixes ?? []).slice(0, 10);

  async function onPdf() {
    setExporting(true);
    try {
      const { exportPdf } = await import("@/lib/report-pdf");
      await exportPdf(review);
    } finally {
      setExporting(false);
    }
  }

  async function onJson() {
    const { downloadJson } = await import("@/lib/report-pdf");
    downloadJson(review);
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="markup-heading">
        <h2 id="markup-heading" className="font-display text-2xl font-bold tracking-tight">Marked-up design</h2>
        <p className="mt-1 text-muted">Pins show the top {top10.length} ranked fixes. Hover over or tap a pin to see the fix.</p>
        {/* Landscape screens take two columns and portrait screens one, so pins stay legible. */}
        <div className="mt-4 grid grid-flow-dense gap-4 md:grid-cols-3">
          {review.images.map((img) => (
            <div key={img.id} className={img.width < img.height ? "md:col-span-1" : review.images.length === 1 ? "md:col-span-3" : "md:col-span-2"}>
              <MarkedUpScreen image={img} fixes={top10.filter((f) => f.screenRef === img.id)} />
            </div>
          ))}
        </div>
      </section>

      <ResultsTabs review={review} />

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <button type="button" onClick={onPdf} disabled={exporting} className="min-h-11 rounded-md bg-ink px-5 font-semibold text-white transition-transform enabled:active:scale-[0.97] disabled:opacity-60">
          {exporting ? "Building PDF…" : "Export PDF"}
        </button>
        <button type="button" onClick={onJson} className="min-h-11 rounded-md border border-ink px-5 font-semibold transition-transform active:scale-[0.97]">Download JSON</button>
        <Link href="/" className="flex min-h-11 basis-full items-center font-semibold underline decoration-pen decoration-2 underline-offset-4 sm:ml-auto sm:basis-auto sm:justify-center sm:px-3">
          Start a new review
        </Link>
      </div>
    </div>
  );
}
