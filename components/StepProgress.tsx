"use client";

import { useEffect, useState } from "react";
import { STEPS, type StepId, type StepState } from "@/lib/steps";

const LABEL = { waiting: "Waiting", running: "Running", done: "Done", failed: "Failed" } as const;
const BADGE = {
  waiting: "bg-paper text-muted border-line",
  running: "bg-warn-soft text-warn border-warn/30",
  done: "bg-pass-soft text-pass border-pass/30",
  failed: "bg-fail-soft text-fail border-fail/30",
} as const;

function elapsed(s: StepState, now: number) {
  if (!s.startedAt) return "";
  const ms = (s.status === "running" ? now : s.finishedAt ?? now) - s.startedAt;
  return `${Math.max(0, Math.round(ms / 1000))}s`;
}

export default function StepProgress({ steps, onRetry }: { steps: Record<StepId, StepState>; onRetry?: (id: StepId) => void }) {
  const [now, setNow] = useState(() => Date.now());
  const anyRunning = Object.values(steps).some((s) => s.status === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyRunning]);

  const done = Object.values(steps).filter((s) => s.status === "done").length;

  return (
    <section aria-labelledby="progress-heading" className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="progress-heading" className="font-display text-xl font-bold">Steps</h2>
        <p className="font-semibold" aria-live="polite" data-testid="step-counter">{done} of 7 steps finished</p>
      </div>
      <ol className="mt-4 space-y-2">
        {STEPS.map((s, i) => {
          const st = steps[s.id];
          return (
            <li key={s.id} className={`rounded-lg border border-line p-3 ${s.parallel ? "ml-4 sm:ml-8" : ""}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="w-5 font-display font-bold text-pen">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{s.name}</span>
                  <span className="block text-sm text-muted">{s.description}</span>
                </span>
                <span className="flex items-center gap-2">
                  {st.startedAt && <span className="text-sm tabular-nums text-muted">{elapsed(st, now)}</span>}
                  <span className={`rounded-full border px-2.5 py-0.5 text-sm font-semibold ${BADGE[st.status]}`}>
                    {st.status === "running" && <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-warn align-middle" aria-hidden="true" />}
                    {LABEL[st.status]}
                  </span>
                  {st.status === "failed" && onRetry && (
                    <button type="button" onClick={() => onRetry(s.id)} className="min-h-11 rounded-md border border-ink px-3 text-sm font-semibold">
                      Retry
                    </button>
                  )}
                </span>
              </div>
              {st.status === "failed" && st.error && <p role="alert" className="mt-2 pl-8 text-sm text-fail">{st.error}</p>}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-muted">The 5 indented agents work at the same time.</p>
    </section>
  );
}
