// Browser only. Reviews live in IndexedDB under their ID; key settings live in sessionStorage only.
import { get, set } from "idb-keyval";
import type { Review } from "./steps";

const reviewKey = (id: string) => `review:${id}`;

export async function loadReview(id: string): Promise<Review | undefined> {
  return get<Review>(reviewKey(id));
}

export async function saveReview(review: Review): Promise<void> {
  await set(reviewKey(review.id), review);
}

// Parallel steps update the same record, so updates are queued to avoid lost writes.
let queue: Promise<unknown> = Promise.resolve();
export function updateReview(id: string, change: (r: Review) => void): Promise<Review> {
  const next = queue.then(async () => {
    const r = await loadReview(id);
    if (!r) throw new Error("Review not found");
    change(r);
    await saveReview(r);
    return r;
  });
  queue = next.catch(() => undefined);
  return next;
}

export function newReviewId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return "rev-" + Array.from(bytes, (b) => alphabet[b & 63]).join("");
}

// ---------- key settings (sessionStorage only, never IndexedDB) ----------
export type KeyMode = "outskill" | "byok";
const MODE = "dm-key-mode";
const KEY = "dm-byok-key";
const MODEL = "dm-model";

function session(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}
export function getKeySettings(): { mode: KeyMode; key: string } {
  const s = session();
  return { mode: s?.getItem(MODE) === "byok" ? "byok" : "outskill", key: s?.getItem(KEY) ?? "" };
}
export function setKeyMode(mode: KeyMode) { session()?.setItem(MODE, mode); }
export function setByokKey(key: string) {
  const s = session();
  if (key) s?.setItem(KEY, key); else s?.removeItem(KEY);
}
export function getSavedModel(): string { return session()?.getItem(MODEL) ?? ""; }
export function setSavedModel(model: string) { session()?.setItem(MODEL, model); }

// Headers for calls to our own /api routes. Option 1 sends no key header at all.
export function keyHeaders(mode: KeyMode): Record<string, string> {
  if (mode !== "byok") return {};
  return { "x-openrouter-key": getKeySettings().key };
}

// ---------- images ----------
// Resize to at most `max` px on the longest side and re-encode as JPEG.
export async function resizeImage(file: Blob, max = 1280, quality = 0.85): Promise<{ src: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("This file couldn't be read as an image. Use PNG, JPG or WebP."));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // transparent PNGs get a white background
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { src: canvas.toDataURL("image/jpeg", quality), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Shrink a data URL further (used if the request would pass the 4 MB body limit).
export async function shrinkDataUrl(src: string, max: number, quality: number) {
  const blob = await (await fetch(src)).blob();
  return resizeImage(blob, max, quality);
}
