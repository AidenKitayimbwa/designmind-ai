import ReviewersList from "@/components/ReviewersList";
import UploadForm from "@/components/UploadForm";

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="max-w-3xl">
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          Find what to fix in your design, in about a minute
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Upload screens of your product. 6 AI reviewers check the visuals, usability, accessibility and market, then mark up your design with the fixes that matter most.
        </p>
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <UploadForm />
        <ReviewersList />
      </div>
    </div>
  );
}
