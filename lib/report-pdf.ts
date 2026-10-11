// Browser only. Builds the optional PDF report with jsPDF + autotable (loaded only when clicked).
import { isBorderline } from "./contrast";
import type { Review } from "./steps";

export async function exportPdf(review: Review): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const o = review.outputs;
  const margin = 40;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;

  const last = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  const ensure = (h: number) => { if (y + h > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; } };
  const heading = (text: string) => { ensure(40); y += 14; doc.setFont("helvetica", "bold").setFontSize(14).text(text, margin, y); y += 10; };
  const para = (text: string) => {
    doc.setFont("helvetica", "normal").setFontSize(10);
    for (const line of doc.splitTextToSize(text, width) as string[]) { ensure(14); y += 13; doc.text(line, margin, y); }
    y += 4;
  };
  const table = (head: string[], body: (string | number)[][]) => {
    if (body.length === 0) { para("No data."); return; }
    autoTable(doc, { head: [head], body, startY: y + 6, margin: { left: margin, right: margin }, styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [27, 31, 59] } });
    y = last() + 6;
  };

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
    (o.market?.competitors ?? []).map((c) => [c.rank, c.name, c.website, c.positioning, c.strengths.join("; "), c.weaknesses.join("; ")]));
  table(["Trend", "Detail", "Source"], (o.market?.trends ?? []).map((t) => [t.trend, t.detail, t.source]));

  // 8. Comparison
  heading("Comparison");
  if (o.compare) para(o.compare.note);
  table(["Area", "Stronger", "Reason"], (o.compare?.picks ?? []).map((p) => [p.area, p.winner, p.reason]));

  // 9. Sources
  heading("Sources");
  const urls = new Map<string, string>();
  for (const c of [...(o.search?.trace.citedUrls ?? []), ...(o.market?.trace.citedUrls ?? [])]) urls.set(c.url, c.title);
  if (urls.size === 0) para("No web sources.");
  for (const [url, title] of urls) para(`${title}: ${url}`);

  doc.save(`designmind-${review.id}.pdf`);
}

export function downloadJson(review: Review): void {
  const blob = new Blob([JSON.stringify(review, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: `designmind-${review.id}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
