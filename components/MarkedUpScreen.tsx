"use client";

import { useState } from "react";
import type { Fix, ScreenImage } from "@/lib/steps";

// One screenshot with numbered pins drawn from the boxes of the top ranked fixes.
export default function MarkedUpScreen({ image, fixes }: { image: ScreenImage; fixes: Fix[] }) {
  const [active, setActive] = useState<number | null>(null);
  const current = fixes.find((f) => f.rank === active);

  return (
    <figure className="min-w-0 rounded-xl border border-line bg-surface p-3" data-testid="marked-up-screen">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-bold">{image.label}</span>
        <span className="text-sm text-muted">{fixes.length} fix{fixes.length === 1 ? "" : "es"} pinned</span>
      </figcaption>
      <div className="relative overflow-hidden rounded-lg border border-line bg-paper" onMouseLeave={() => setActive(null)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} alt={`${image.label} with ${fixes.length} pinned fixes`} className="block h-auto w-full" />
        {current && (
          <div
            className="pointer-events-none absolute rounded border-2 border-pen bg-pen/10"
            style={{ left: `${current.box[0] / 10}%`, top: `${current.box[1] / 10}%`, width: `${current.box[2] / 10}%`, height: `${current.box[3] / 10}%` }}
            aria-hidden="true"
          />
        )}
        {fixes.map((f) => (
          <button
            key={f.rank}
            type="button"
            data-testid="pin"
            className={`pin absolute -translate-x-1/2 -translate-y-full cursor-pointer ${active === f.rank ? "z-20 scale-110" : "z-10"}`}
            style={{ left: `${Math.min(97, Math.max(3, f.box[0] / 10))}%`, top: `${Math.min(100, Math.max(6, f.box[1] / 10))}%` }}
            aria-label={`Fix ${f.rank}: ${f.action}`}
            aria-pressed={active === f.rank}
            onMouseEnter={() => setActive(f.rank)}
            onFocus={() => setActive(f.rank)}
            onClick={() => setActive(f.rank)}
          >
            {f.rank}
          </button>
        ))}
      </div>
      <div className="mt-2 min-h-16 rounded-lg bg-paper p-3 text-sm" aria-live="polite">
        {current ? (
          <p>
            <span className="font-bold">Fix {current.rank} ({current.priority}): </span>{current.action}
            <span className="block text-muted">{current.why}</span>
          </p>
        ) : (
          <p className="text-muted">Hover over or tap a pin to see the fix.</p>
        )}
      </div>
      {/* On mobile, list the fixes under each screenshot too. */}
      <ol className="mt-3 space-y-2 sm:hidden">
        {fixes.map((f) => (
          <li key={f.rank} className="flex gap-2 text-sm">
            <span className="pin shrink-0">{f.rank}</span>
            <span><span className="font-semibold">{f.priority}</span> {f.action}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
