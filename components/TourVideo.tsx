// The product tour: a silent screen recording of uploading screens and exploring the example review.
export default function TourVideo() {
  return (
    <section id="tour" aria-labelledby="tour-heading" className="scroll-mt-6 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 id="tour-heading" className="font-display text-2xl font-bold tracking-tight">Product tour</h2>
      <p className="mt-1 text-muted">A short, silent walkthrough: adding screenshots on the home page, then exploring this review&apos;s pins and tabs.</p>
      <video
        className="mt-4 aspect-video w-full rounded-lg border border-line bg-paper"
        src="/examples/tour.webm"
        poster="/examples/tour-poster.jpg"
        controls
        muted
        playsInline
        preload="metadata"
      >
        Your browser can&apos;t play this video. <a href="/examples/tour.webm">Download the tour</a>.
      </video>
    </section>
  );
}
