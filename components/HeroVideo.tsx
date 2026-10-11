"use client";

import { useEffect, useRef, useState } from "react";

// The brand video in the hero: muted, looping, with a pause button. It stays still for reduced-motion users.
export default function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, []);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().then(() => setPlaying(true)).catch(() => undefined);
    else { v.pause(); setPlaying(false); }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-navy shadow-[0_30px_60px_-24px_rgba(20,40,75,0.55)] ring-1 ring-navy/10">
      <video
        ref={ref}
        className="block aspect-video w-full object-cover"
        src="/designmind-hero-2.mp4"
        poster="/designmind-hero-poster.jpg"
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="DesignMind AI reviewing a landing page for visual design, user experience and competitors, then showing recommendations"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause video" : "Play video"}
        className="absolute bottom-3 right-3 flex size-11 items-center justify-center rounded-full bg-paper/90 text-ink shadow hover:bg-paper"
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>
    </div>
  );
}
