import { STEPS } from "@/lib/steps";

export default function ReviewersList() {
  return (
    <section aria-labelledby="reviewers-heading" className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <h2 id="reviewers-heading" className="font-display text-2xl font-bold tracking-tight">Who reviews your design</h2>
      <ol className="mt-4 space-y-1">
        {STEPS.map((s, i) => (
          <li key={s.id} className={`flex gap-3 rounded-lg py-2 ${s.parallel ? "ml-5 border-l-2 border-line pl-4 sm:ml-7" : ""}`}>
            <span className="mt-0.5 w-6 shrink-0 font-display font-bold text-pen">{i + 1}</span>
            <span>
              <span className="font-bold">{s.name}</span>
              <span className="block text-muted">{s.description}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-sm text-muted">The 5 indented agents work at the same time.</p>
      <p className="mt-4 border-t border-line pt-4 text-sm text-muted">
        Every reviewer runs on Gemini 3.8 Flash through OpenRouter by default. Colour contrast is measured from the pixels with the WCAG 2.2 formula, not guessed.
      </p>
    </section>
  );
}
