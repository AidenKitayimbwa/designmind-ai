"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ReviewResults from "@/components/ReviewResults";
import StepProgress from "@/components/StepProgress";
import { retryStep, runReview } from "@/lib/pipeline";
import { loadReview } from "@/lib/review-store";
import type { Review, StepId } from "@/lib/steps";

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [review, setReview] = useState<Review | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    const emit = (r: Review) => { if (alive) setReview({ ...r }); };
    loadReview(id)
      .then((r) => {
        if (!alive) return;
        if (!r) { setMissing(true); return; }
        setReview(r);
        const unfinished = Object.values(r.steps).some((s) => s.status === "waiting" || s.status === "running");
        if (unfinished) runReview(id, emit);
      })
      .catch(() => alive && setMissing(true));
    return () => { alive = false; };
  }, [id]);

  if (missing) {
    return (
      <div className="max-w-2xl rounded-xl border border-line bg-surface p-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">Review not found</h1>
        <p className="mt-3">This review isn&apos;t saved in this browser. Reviews are stored only in the browser that created them.</p>
        <Link href="/" className="mt-5 inline-flex min-h-11 items-center rounded-md bg-ink px-5 font-semibold text-white">Start a new review</Link>
      </div>
    );
  }

  if (!review) return <p className="text-muted" role="status">Loading review…</p>;

  const finished = review.steps.lead.status === "done";
  const usedKey = Object.values(review.steps).find((s) => s.keySource)?.keySource ?? (review.keyMode === "byok" ? "user" : "outskill");
  const retry = (step: StepId) => retryStep(review.id, step, (r) => setReview({ ...r }));

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Reviewing your design</h1>
          <p className="mt-2 text-muted">
            {finished ? "All steps have run. Your results are below." : "This usually takes 30 to 90 seconds. You can keep this page open or reload it."}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div><dt className="inline text-muted">Key in use: </dt><dd className="inline font-semibold" data-testid="key-in-use">{usedKey === "user" ? "Your key" : "Default key"}</dd></div>
          <div><dt className="inline text-muted">Model: </dt><dd className="inline break-all font-semibold">{review.model}</dd></div>
        </dl>
      </header>

      <div className={`grid items-start gap-6 ${finished ? "" : "lg:grid-cols-[minmax(0,1fr)_320px]"}`}>
        <StepProgress steps={review.steps} onRetry={retry} />
        {!finished && (
          <aside className="grid grid-cols-3 gap-2 lg:grid-cols-1" aria-label="Your screenshots">
            {review.images.map((img) => (
              <figure key={img.id} className="overflow-hidden rounded-lg border border-line bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt={img.label} className="h-24 w-full object-contain sm:h-32" />
                <figcaption className="truncate px-2 py-1 text-xs font-semibold">{img.label}</figcaption>
              </figure>
            ))}
          </aside>
        )}
      </div>

      {finished && <ReviewResults review={review} />}
      {!finished && review.steps.lead.status === "failed" && (
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold underline decoration-pen decoration-2 underline-offset-4">Start a new review</Link>
      )}
    </div>
  );
}
