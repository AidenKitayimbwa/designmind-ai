import type { Metadata } from "next";
import Link from "next/link";
import ReviewResults from "@/components/ReviewResults";
import StepProgress from "@/components/StepProgress";
import TourVideo from "@/components/TourVideo";
import type { Review } from "@/lib/steps";
import sample from "@/tests/fixtures/sample-result.json";

export const metadata: Metadata = { title: "Example review | DesignMind AI" };

// A finished review built from the saved sample result. No API calls and no key.
export default function ExamplePage() {
  const review = sample as unknown as Review;
  return (
    <div className="space-y-8">
      <p className="rounded-lg border border-pen/30 bg-pen-soft px-4 py-3" role="note">
        This is an example review. <Link href="/" className="font-semibold underline underline-offset-4">Start your own</Link>.
      </p>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Example review</h1>
          <p className="mt-2 text-muted">{review.context.product}{review.context.audience ? `, for ${review.context.audience}` : ""}.</p>
        </div>
        <dl className="text-sm"><dt className="inline text-muted">Model: </dt><dd className="inline font-semibold">{review.model}</dd></dl>
      </header>
      <TourVideo />
      <StepProgress steps={review.steps} />
      <ReviewResults review={review} />
    </div>
  );
}
