// Browser only. Builds the optional PDF report with jsPDF + autotable (loaded only when clicked).
import { isBorderline } from "./contrast";
import type { Citation, Review } from "./steps";

// jsPDF's built-in Helvetica only draws Latin-1 plus a few typographic marks. Web titles often carry
// right-to-left marks, line breaks, emoji or private-use glyphs that print as garbage, so strip them.
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function pdfText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "") // zero-width and bidi marks
    .replace(/\u2212/g, "-") // minus sign
    .split("")
    .map((ch) => (ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.includes(ch) ? ch : " "))
    .join("")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ") // control characters, including line breaks
    .replace(/\s+/g, " ")
    .trim();
}

// A readable link label: the host plus a shortened path.
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname).replace(/\/$/, "");
    const label = u.hostname.replace(/^www\./, "") + path;
    return label.length > 44 ? label.slice(0, 42) + "..." : label;
  } catch {
    return url.length > 44 ? url.slice(0, 42) + "..." : url;
  }
}

// Clickable link cells: the cell shows a short label, the whole cell links to the full URL.
type LinkCell = { content: string; url: string };

export async function exportPdf(review: Review): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const o = review.outputs;
  const margin = 40;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  const last = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const ensure = (h: number) => { if (y + h > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; } };
  const heading = (text: string) => { ensure(40); y += 14; doc.setFont("helvetica", "bold").setFontSize(14).text(pdfText(text), margin, y); y += 10; };
  const para = (text: string) => {
    doc.setFont("helvetica", "normal").setFontSize(10);
    for (const line of doc.splitTextToSize(pdfText(text), width) as string[]) { ensure(14); y += 13; doc.text(line, margin, y); }
    y += 4;
  };
  const table = (head: string[], body: (string | number | LinkCell)[][], columnStyles: Record<number, object> = {}) => {
    if (body.length === 0) { para("No data."); return; }
    const urls = new Map<string, string>(); // "row:col" -> url
    const rows = body.map((row, r) => row.map((cell, c) => {
      if (typeof cell === "object") { urls.set(`${r}:${c}`, cell.url); return { content: pdfText(cell.content), styles: { textColor: [29, 78, 216] as [number, number, number] } }; }
      return typeof cell === "number" ? cell : pdfText(cell);
    }));
    autoTable(doc, {
      head: [head], body: rows, startY: y + 6, margin: { left: margin, right: margin }, rowPageBreak: "avoid",
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" }, headStyles: { fillColor: [27, 31, 59] }, columnStyles,
      didDrawCell: (d) => {
        const url = d.section === "body" ? urls.get(`${d.row.index}:${d.column.index}`) : undefined;
        if (url) doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url });
      },
    });
    y = last() + 6;
  };
  const link = (url: string): LinkCell => ({ content: shortUrl(url), url });

  // 1. Title block
  doc.setFont("helvetica", "bold").setFontSize(20).text("DesignMind AI review", margin, y + 10);
  y += 30;
  para(`Product: ${review.context.product || o.search?.productCategory || "Not given"}`);
  para(`Date: ${new Date(review.createdAt).toLocaleString()}   Model: ${review.model}`);

  // 2. Executive summary
  heading("Executive summary");
  para(o.lead?.summary ?? "The lead reviewer didn't finish, so there is no summary.");
  if (o.lead?.gaps) para(`Gaps: ${o.lead.gaps}`);

  // 3. Scores
  heading("Scores (0–100)");
  table(["Screen", "Visual", "Usability", "Accessibility", "Market fit", "Overall"],
    (o.lead?.scores ?? []).map((s) => [s.screenRef, s.visual, s.usability, s.accessibility, s.marketFit, s.overall]));

  // 4. Ranked fixes
  heading("Ranked fixes");
  table(["#", "Priority", "Action", "Why", "Impact", "Effort", "Owner", "Screen"],
    (o.lead?.fixes ?? []).map((f) => [f.rank, f.priority, f.action, f.why, f.impact, f.effort, f.owner, f.screenRef]));
  if (o.lead?.quickWins.length) { para("Quick wins:"); o.lead.quickWins.forEach((q) => para(`• ${q}`)); }

  // 5. Accessibility measurements
  heading("Accessibility measurements");
  para("Contrast is measured from the pixels with the WCAG 2.2 formula. Target sizes are estimates.");
  table(["Screen", "Element", "Role", "Ratio", "Needs", "Contrast", "Est. size", "Size"],
    (o.a11y?.measurements ?? []).map((m) => [m.screenRef, m.text, m.role, m.ratio ? `${m.ratio.toFixed(2)}:1` : "n/a", `${m.required}:1`,
      m.contrastPass === null ? "n/a" : m.contrastPass ? "Pass" : isBorderline(m) ? "Borderline" : "Fail", m.estSize ? `~${m.estSize.w}×${m.estSize.h}` : "", m.sizePass === null ? "" : m.sizePass ? "Pass" : "Fail"]));

  // 6. UX and visual issues
  heading("UX and visual issues");
  table(["Screen", "Severity", "Principle", "Evidence", "Recommendation"],
    [...(o.ux?.issues ?? []), ...(o.visual?.issues ?? []), ...(o.a11y?.issues ?? [])].map((i) => [i.screenRef, i.severity, i.principle, i.evidence, i.recommendation]));

  // 7. Competitors and trends
  heading("Top competitors and trends");
  if (o.market?.note) para(o.market.note);
  table(["#", "Name", "Website", "Positioning", "Strengths", "Weaknesses"],
    (o.market?.competitors ?? []).map((c) => [c.rank, c.name, link(c.website), c.positioning, c.strengths.join("; "), c.weaknesses.join("; ")]));
  table(["Trend", "Detail", "Source"], (o.market?.trends ?? []).map((t) => [t.trend, t.detail, link(t.source)]), { 2: { cellWidth: 150 } });

  // 8. Comparison
  heading("Comparison");
  if (o.compare) para(o.compare.note);
  table(["Area", "Stronger", "Reason"], (o.compare?.picks ?? []).map((p) => [p.area, p.winner, p.reason]));

  // 9. Sources, grouped by the step whose web search returned them
  heading("Sources");
  const seen = new Set<string>();
  const group = (cited: Citation[] | undefined) =>
    (cited ?? []).filter((c) => !seen.has(c.url) && seen.add(c.url)).map((c) => ({ title: pdfText(c.title) || shortUrl(c.url), url: c.url }));
  const groups = [
    { name: "Image search (step 1)", items: group(o.search?.trace.citedUrls) },
    { name: "Market research (step 5)", items: group(o.market?.trace.citedUrls) },
  ].filter((g) => g.items.length > 0);
  if (groups.length === 0) para("No web sources.");
  for (const g of groups) {
    ensure(40);
    y += 10;
    doc.setFont("helvetica", "bold").setFontSize(11).text(`${g.name}: ${g.items.length} source${g.items.length === 1 ? "" : "s"}`, margin, y);
    table(["#", "Title", "Link"], g.items.map((c, i) => [i + 1, c.title, link(c.url)]), { 0: { cellWidth: 22 }, 2: { cellWidth: 190 } });
  }

  doc.save(`designmind-${review.id}.pdf`);
}

export function downloadJson(review: Review): void {
  const blob = new Blob([JSON.stringify(review, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `designmind-${review.id}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
