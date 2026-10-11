// Browser only. Measures colour contrast from screenshot pixels (WCAG 2.2) and estimates target sizes.
import type { A11yElement, Issue, Measurement, ScreenImage } from "./steps";

type RGB = [number, number, number];

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export const luminance = ([r, g, b]: RGB) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export function contrastRatio(a: RGB, b: RGB): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export const toHex = (c: RGB) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
export const fromHex = (hex: string): RGB => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
};

export async function loadImageData(src: string): Promise<ImageData> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't load the screenshot for measurement."));
    el.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// Group the box's pixels by colour: the most common colour is the background. The text colour is the
// most distinct common colour: the average of the pixels that contrast most with the background. Ranking by
// contrast (not exact colour) copes with anti-aliased text and ignores thin borders and JPEG noise.
export function measureBox(data: ImageData, box: [number, number, number, number]): { ratio: number; fg: RGB; bg: RGB } | null {
  const { width: W, height: H } = data;
  const x0 = Math.floor((box[0] / 1000) * W), y0 = Math.floor((box[1] / 1000) * H);
  const x1 = Math.min(W, Math.ceil(((box[0] + box[2]) / 1000) * W)), y1 = Math.min(H, Math.ceil(((box[1] + box[3]) / 1000) * H));
  const area = (x1 - x0) * (y1 - y0);
  if (area < 4) return null;
  const step = Math.max(1, Math.floor(Math.sqrt(area / 40_000))); // sample at most ~40k pixels

  const pixels: RGB[] = [];
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * W + x) * 4;
      const c: RGB = [data.data[i], data.data[i + 1], data.data[i + 2]];
      pixels.push(c);
      const k = ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3); // 32 levels per channel
      const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++; e.r += c[0]; e.g += c[1]; e.b += c[2];
      buckets.set(k, e);
    }
  }
  const top = [...buckets.values()].reduce((a, b) => (b.n > a.n ? b : a));
  const bg: RGB = [top.r / top.n, top.g / top.n, top.b / top.n];

  const distinct = pixels.map((c) => ({ c, ratio: contrastRatio(c, bg) })).filter((p) => p.ratio >= 1.1);
  if (distinct.length < Math.max(4, pixels.length * 0.002)) return null;
  distinct.sort((a, b) => b.ratio - a.ratio);
  const core = distinct.slice(0, Math.max(3, Math.ceil(distinct.length * 0.02)));
  const fg = [0, 1, 2].map((ch) => core.reduce((s, p) => s + p.c[ch], 0) / core.length) as RGB;
  return { ratio: Math.round(contrastRatio(fg, bg) * 100) / 100, fg, bg };
}

// Move the text colour toward black or white until it reaches the required ratio.
export function suggestColor(fg: RGB, bg: RGB, required: number): string {
  const target: RGB = luminance(bg) > 0.18 ? [0, 0, 0] : [255, 255, 255];
  for (let t = 0; t <= 1; t += 0.02) {
    const c = fg.map((v, i) => v + (target[i] - v) * t) as RGB;
    if (contrastRatio(c, bg) >= required) return toHex(c);
  }
  return toHex(target);
}

// A fail within 15% of the threshold may come from anti-aliasing on thin text rather than the colours themselves.
export const isBorderline = (m: Pick<Measurement, "ratio" | "required" | "contrastPass">) =>
  m.contrastPass === false && m.ratio !== null && m.ratio >= m.required * 0.85;

const TARGET_ROLES = new Set(["button", "link", "icon button", "input"]);

// Estimate CSS px: assume a 390 px-wide viewport for portrait screenshots and 1440 px for landscape.
export function estimateCssSize(box: [number, number, number, number], img: { width: number; height: number }) {
  const viewport = img.height > img.width ? 390 : 1440;
  const pxPerCss = img.width / viewport;
  return { w: Math.round(((box[2] / 1000) * img.width) / pxPerCss), h: Math.round(((box[3] / 1000) * img.height) / pxPerCss) };
}

export async function measureAll(elements: A11yElement[], images: ScreenImage[]): Promise<{ measurements: Measurement[]; issues: Issue[] }> {
  const pixels = new Map<string, ImageData>();
  for (const img of images) pixels.set(img.id, await loadImageData(img.src));

  const measurements: Measurement[] = [];
  const issues: Issue[] = [];
  for (const el of elements) {
    const img = images.find((i) => i.id === el.screenRef);
    const data = pixels.get(el.screenRef);
    if (!img || !data) continue;
    const size = estimateCssSize(el.box, img);
    const large = el.role === "heading" && size.h >= 24;
    const required = el.role === "icon button" || large ? 3 : 4.5;
    const m = measureBox(data, el.box);
    const isTarget = TARGET_ROLES.has(el.role);
    const measurement: Measurement = {
      elementId: el.id, screenRef: el.screenRef, role: el.role, text: el.text, box: el.box,
      ratio: m?.ratio ?? null, required,
      contrastPass: m ? m.ratio >= required : null,
      fg: m ? toHex(m.fg) : null, bg: m ? toHex(m.bg) : null,
      estSize: isTarget ? size : null,
      sizePass: isTarget ? size.w >= 24 && size.h >= 24 : null,
    };
    measurements.push(measurement);

    if (m && !measurement.contrastPass) {
      const nonText = el.role === "icon button";
      const close = isBorderline(measurement);
      issues.push({
        id: `a11y-c-${issues.length + 1}`,
        screenRef: el.screenRef,
        box: el.box,
        principle: nonText ? "WCAG 2.2 SC 1.4.11 Non-text Contrast" : "WCAG 2.2 SC 1.4.3 Contrast (Minimum)",
        severity: close ? "minor" : m.ratio < 3 ? "critical" : "major",
        evidence: `"${el.text}" (${el.role}) measures ${m.ratio.toFixed(2)}:1 (${toHex(m.fg)} on ${toHex(m.bg)}); it needs ${required}:1.${close ? " Borderline: anti-aliasing can make small, thin text measure slightly lower than its CSS colour, so check the colours in code." : ""}`,
        recommendation: `Change the ${nonText ? "icon" : "text"} colour to about ${suggestColor(m.fg, m.bg, required)} (or adjust the background) to reach at least ${required}:1.`,
        effort: "S",
        citations: [nonText ? "wcag-non-text-contrast" : large ? "wcag-contrast-large" : "wcag-contrast-text"],
      });
    }
    if (isTarget && measurement.sizePass === false) {
      issues.push({
        id: `a11y-s-${issues.length + 1}`,
        screenRef: el.screenRef,
        box: el.box,
        principle: "WCAG 2.2 SC 2.5.8 Target Size (Minimum)",
        // A link's box hugs its text, so its real clickable area may be larger (and links inside text are exempt).
        severity: el.role !== "link" && Math.min(size.w, size.h) < 16 ? "major" : "minor",
        evidence: `"${el.text}" (${el.role}) is an estimated ${size.w}×${size.h} CSS px (estimate from screenshot width).${el.role === "link" ? " The clickable area may extend beyond the text; links inside a sentence are exempt." : ""}`,
        recommendation: "Make the target at least 24×24 CSS px (44×44 px for touch), or add spacing so a 24 px circle around it doesn't overlap other targets.",
        effort: "S",
        citations: ["wcag-target-size"],
      });
    }
  }
  return { measurements, issues };
}
