import Link from "next/link";
import ReviewersList from "@/components/ReviewersList";
import UploadForm from "@/components/UploadForm";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="max-w-3xl">
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Find what to fix in your design, in about a minute
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Upload screens of your product. 6 AI reviewers check the visuals, usability, accessibility and market, then mark up your design with the fixes that matter most.
          </p>
        </div>
        <Link href="/examples/example-compare#tour" className="group block overflow-hidden rounded-xl border border-line bg-surface" aria-label="Watch the product tour">
          <span className="relative block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/examples/tour-poster.jpg" alt="" className="aspect-video w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-ink/10 group-hover:bg-ink/20" aria-hidden="true">
              <span className="flex size-14 items-center justify-center rounded-full bg-pen text-white shadow-lg">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
          </span>
          <span className="flex items-center justify-between gap-2 px-4 py-3">
            <span className="font-semibold">Watch the product tour</span>
            <span className="text-sm text-muted">No sound</span>
          </span>
        </Link>
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <UploadForm />
        <ReviewersList />
      </div>
    </div>
  );
}
