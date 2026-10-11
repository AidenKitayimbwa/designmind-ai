"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import KeyOptions from "./KeyOptions";
import {
  getKeySettings, getSavedModel, newReviewId, resizeImage, saveReview, setByokKey, setKeyMode, setSavedModel, shrinkDataUrl,
  type KeyMode,
} from "@/lib/review-store";
import { DEFAULT_MODEL, emptySteps, MODEL_PRESETS, type Review, type ScreenImage, type ScreenRef } from "@/lib/steps";

const LETTERS: ScreenRef[] = ["A", "B", "C"];
const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const BODY_BUDGET = 3.6 * 1024 * 1024; // leave room under the 4 MB request limit

export default function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ScreenImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState("");
  const [website, setWebsite] = useState("");
  const [audience, setAudience] = useState("");
  const [mode, setMode] = useState<KeyMode>("outskill");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [customModel, setCustomModel] = useState("");

  // Restore this tab's key choice (sessionStorage only).
  useEffect(() => {
    const s = getKeySettings();
    setMode(s.mode);
    setApiKey(s.key);
    const saved = getSavedModel();
    if (saved) {
      if (MODEL_PRESETS.some((m) => m.id === saved)) setModel(saved);
      else setCustomModel(saved);
    }
  }, []);

  async function addFiles(files: FileList | File[]) {
    setError("");
    const list = Array.from(files);
    const wrong = list.filter((f) => !ACCEPT.includes(f.type));
    const ok = list.filter((f) => ACCEPT.includes(f.type));
    const free = LETTERS.filter((l) => !images.some((i) => i.id === l));
    if (wrong.length) setError("Only PNG, JPG or WebP images can be added.");
    if (ok.length > free.length) setError("You can add up to 3 images. Remove one to add another.");
    setBusy(true);
    try {
      const added: ScreenImage[] = [];
      for (const [n, file] of ok.slice(0, free.length).entries()) {
        const r = await resizeImage(file);
        added.push({ id: free[n], label: `Screen ${free[n]}`, ...r });
      }
      setImages((prev) => [...prev, ...added].sort((a, b) => a.id.localeCompare(b.id)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const effectiveModel = customModel || model;
  const needsKey = mode === "byok" && !apiKey;
  const canContinue = images.length > 0 && !needsKey && !busy;

  async function onContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    setBusy(true);
    try {
      let imgs = images;
      // Keep every request body under 4 MB.
      for (const [max, q] of [[1024, 0.75], [800, 0.7]] as const) {
        if (imgs.reduce((s, i) => s + i.src.length, 0) <= BODY_BUDGET) break;
        imgs = await Promise.all(imgs.map(async (i) => ({ ...i, ...(await shrinkDataUrl(i.src, max, q)) })));
      }
      const id = newReviewId();
      const review: Review = {
        id,
        createdAt: Date.now(),
        images: imgs,
        context: { product: product.trim(), website: website.trim(), audience: audience.trim() },
        model: effectiveModel,
        keyMode: mode,
        steps: emptySteps(),
        outputs: {},
        retrieved: {},
      };
      await saveReview(review);
      router.push(`/review/${id}`);
    } catch {
      setError("Couldn't save the review in this browser. Check that site storage is allowed, then try again.");
      setBusy(false);
    }
  }

  const field = "mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-3";

  return (
    <form onSubmit={onContinue} className="space-y-6 rounded-xl border border-line bg-surface p-5 sm:p-6" aria-label="Upload your design">
      <div
        data-testid="upload-zone"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center ${dragging ? "border-pen bg-pen-soft" : "border-line bg-paper"}`}
      >
        <p className="font-display text-xl font-bold">Drop your screenshots here</p>
        <p className="text-sm text-muted">Up to 3 images (PNG, JPG or WebP)</p>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={images.length >= 3 || busy} className="min-h-11 rounded-md border border-ink bg-surface px-5 font-semibold disabled:opacity-50">
          Choose files
        </button>
        <input ref={inputRef} type="file" accept={ACCEPT.join(",")} multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {error && <p role="alert" className="rounded-md bg-fail-soft px-3 py-2 text-sm text-fail">{error}</p>}

      {images.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Added screenshots">
          {images.map((img) => (
            <li key={img.id} className="overflow-hidden rounded-lg border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.src} alt={`${img.label} thumbnail`} className="h-36 w-full bg-paper object-contain" />
              <div className="flex items-center gap-2 p-2">
                <label className="sr-only" htmlFor={`label-${img.id}`}>Label for screen {img.id}</label>
                <input
                  id={`label-${img.id}`}
                  value={img.label}
                  onChange={(e) => setImages((prev) => prev.map((p) => (p.id === img.id ? { ...p, label: e.target.value } : p)))}
                  className="min-h-11 min-w-0 flex-1 rounded-md border border-line px-2 text-sm"
                />
                <button type="button" onClick={() => setImages((prev) => prev.filter((p) => p.id !== img.id))} className="min-h-11 rounded-md px-3 text-sm font-semibold text-fail hover:bg-fail-soft" aria-label={`Remove ${img.label}`}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid max-w-xl gap-4">
        <label className="block">
          <span className="font-bold">What is the product? (optional)</span>
          <input value={product} onChange={(e) => setProduct(e.target.value)} className={field} />
          <span className="mt-1 block text-sm text-muted">Helps the market research agent find the right competitors.</span>
        </label>
        <label className="block">
          <span className="font-bold">Product website (optional)</span>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="aiskillrise.com" className={field} />
        </label>
        <label className="block">
          <span className="font-bold">Who is it for? (optional)</span>
          <input value={audience} onChange={(e) => setAudience(e.target.value)} className={field} />
        </label>
      </div>

      <KeyOptions
        mode={mode}
        onModeChange={(m) => { setMode(m); setKeyMode(m); }}
        apiKey={apiKey}
        onKeyChange={(k) => { setApiKey(k); setByokKey(k); }}
        model={model}
        onModelChange={(m) => { setModel(m); setSavedModel(customModel || m); }}
        customModel={customModel}
        onCustomModelChange={(m) => { setCustomModel(m); setSavedModel(m || model); }}
      />

      <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p id="continue-hint" className="text-sm text-muted" aria-live="polite">
          {images.length === 0
            ? "Add at least one screenshot to continue."
            : needsKey
              ? "Enter your OpenRouter key, or switch back to the Outskill key."
              : `Model: ${effectiveModel}`}
        </p>
        <button type="submit" disabled={!canContinue} aria-describedby="continue-hint" className="min-h-12 rounded-md bg-ink px-8 font-display text-lg font-bold text-white disabled:cursor-not-allowed disabled:bg-muted/60">
          {busy && images.length > 0 ? "Preparing…" : "Continue"}
        </button>
      </div>
    </form>
  );
}
