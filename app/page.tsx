import Link from "next/link";
import HeroVideo from "@/components/HeroVideo";
import ReviewersList from "@/components/ReviewersList";
import UploadForm from "@/components/UploadForm";

const FACTS = ["6 AI reviewers", "Contrast measured from pixels (WCAG 2.2)", "Live web research with sources"];

export default function Home() {
  return (
    <div className="space-y-16 sm:space-y-20">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14">
        <div>
          <p className="font-display text-lg font-semibold text-ink">Multimodal AI Design Analysis Suite</p>
          <h1 className="mt-4 font-display text-[2.6rem] font-extrabold leading-[1.04] tracking-tight sm:text-6xl">
            From Design to Insight in a few Minutes.
          </h1>
          <span className="mt-6 block h-1.5 w-20 rounded-full bg-pen-bright" aria-hidden="true" />
          <p className="mt-6 max-w-xl text-lg text-muted">
            Upload screens of your product. 6 AI reviewers check the visuals, usability, accessibility and market, then mark up your design with the fixes that matter most.
          </p>
          {/* On phones the buttons stack at the width of the longer label, not the full screen width. */}
          <div className="mt-8 grid w-fit gap-3 sm:flex sm:flex-wrap sm:items-center">
            <a href="#start" className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-6 font-display text-base font-bold text-paper transition-transform hover:bg-navy active:scale-[0.97] sm:px-7 sm:text-lg">
              Start a review
            </a>
            <Link href="/examples/example-compare" className="inline-flex min-h-12 items-center justify-center rounded-full border-2 border-ink px-6 font-display text-base font-bold text-ink transition-transform hover:bg-surface active:scale-[0.97] sm:px-7 sm:text-lg">
              Quick Walk-through
            </Link>
          </div>
          <ul className="mt-6 flex flex-col gap-2 text-sm text-muted sm:mt-8 sm:flex-row sm:flex-wrap sm:gap-x-6">
            {FACTS.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-pen-bright" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <HeroVideo />
      </section>

      <section id="start" aria-labelledby="start-heading" className="scroll-mt-24">
        <h2 id="start-heading" className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">Start a review</h2>
        <p className="mt-2 text-muted">Add up to 3 screenshots. A full review takes about 2–3 minutes.</p>
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <UploadForm />
          <ReviewersList />
        </div>
      </section>
    </div>
  );
}
