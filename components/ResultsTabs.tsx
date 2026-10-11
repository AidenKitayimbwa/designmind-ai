"use client";

import { useState } from "react";
import { isBorderline } from "@/lib/contrast";
import { KNOWLEDGE } from "@/lib/knowledge";
import type { Issue, RetrievedChunk, Review, Severity } from "@/lib/steps";
import { STEP_NAME } from "@/lib/steps";

const TABS = ["Overview", "Visual", "UX critique", "Accessibility", "Market", "Comparison", "Similar apps"] as const;
type Tab = (typeof TABS)[number];

const KB_TITLE = new Map(KNOWLEDGE.map((k) => [k.id, k.title]));
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const card = "rounded-xl border border-line bg-surface p-4 sm:p-5";
const h3 = "font-display text-lg font-bold";
const tableWrap = "-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0";
const th = "border-b border-line px-2 py-2 text-left font-semibold whitespace-nowrap";
const td = "border-b border-line px-2 py-2 align-top";

function Missing({ what }: { what: string }) {
  return <p className={`${card} text-muted`}>{what} didn&apos;t finish, so there are no results here. Use Retry in the step list to run it again.</p>;
}

function Citations({ ids }: { ids: string[] }) {
  if (!ids?.length) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
      <span className="text-muted">Sources:</span>
      {ids.map((id) =>
        /^https?:\/\//.test(id) ? (
          <a key={id} href={id} target="_blank" rel="noopener noreferrer" className="max-w-full truncate rounded bg-paper px-1.5 py-0.5 underline">{host(id)}</a>
        ) : (
          <span key={id} title={KB_TITLE.get(id.split("#")[0]) ?? id} className="rounded bg-paper px-1.5 py-0.5 font-mono">{id}</span>
        ),
      )}
    </p>
  );
}

const SEV: Record<Severity, string> = { critical: "bg-fail-soft text-fail", major: "bg-warn-soft text-warn", minor: "bg-paper text-muted" };

function IssueList({ issues, filterable = false }: { issues: Issue[]; filterable?: boolean }) {
  const [sev, setSev] = useState<Severity | "all">("all");
  const shown = issues.filter((i) => sev === "all" || i.severity === sev);
  return (
    <div className="space-y-3">
      {filterable && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by severity">
          {(["all", "critical", "major", "minor"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={sev === s} onClick={() => setSev(s)} className={`min-h-11 rounded-md border px-3 text-sm font-semibold capitalize ${sev === s ? "border-ink bg-ink text-white" : "border-line bg-surface"}`}>
              {s} {s === "all" ? `(${issues.length})` : `(${issues.filter((i) => i.severity === s).length})`}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 && <p className="text-muted">No issues.</p>}
      <ul className="space-y-3">
        {shown.map((i) => (
          <li key={i.id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`rounded px-2 py-0.5 font-semibold capitalize ${SEV[i.severity]}`}>{i.severity}</span>
              <span className="font-semibold">Screen {i.screenRef}</span>
              <span className="text-muted">{i.principle}</span>
              <span className="text-muted">Effort {i.effort}</span>
            </div>
            <p className="mt-2">{i.evidence}</p>
            <p className="mt-1"><span className="font-semibold">Fix: </span>{i.recommendation}</p>
            <Citations ids={i.citations} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Retrieved({ chunks }: { chunks?: RetrievedChunk[] }) {
  if (!chunks?.length) return null;
  return (
    <details className={card}>
      <summary className="min-h-8 cursor-pointer font-semibold">Retrieved context ({chunks.length} chunks)</summary>
      <ul className="mt-3 space-y-2 text-sm">
        {chunks.map((c) => (
          <li key={c.id} className="rounded-lg bg-paper p-3">
            <span className="font-mono text-xs">{c.id}</span> <span className="font-semibold">{c.title}</span> <span className="text-xs text-muted">score {c.score}</span>
            <p className="mt-1 text-muted">{c.text}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ScoreBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="font-semibold tabular-nums">{value}{max === 5 ? "/5" : ""}</span></div>
      <div className="mt-1 h-2 rounded-full bg-paper" aria-hidden="true"><div className="h-2 rounded-full bg-ink" style={{ width: `${(value / max) * 100}%` }} /></div>
    </div>
  );
}

const yesNo = (v: boolean | null) => v === null ? <span className="text-muted">n/a</span> : v ? <span className="font-semibold text-pass">Pass</span> : <span className="font-semibold text-fail">Fail</span>;

export default function ResultsTabs({ review }: { review: Review }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const o = review.outputs;
  const step1Failed = review.steps.search.status === "failed";

  return (
    <section aria-label="Results" className="space-y-4">
      {/* On phones the tabs form one row you swipe sideways; from the sm breakpoint they wrap. */}
      <div role="tablist" aria-label="Results" data-testid="tablist"
        className="-mx-4 flex snap-x scroll-px-4 gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} aria-controls="tab-panel"
            onClick={(e) => { setTab(t); e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" }); }}
            className={`min-h-11 shrink-0 snap-start whitespace-nowrap rounded-t-md border-b-2 px-3 font-semibold ${tab === t ? "border-pen text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {t}
          </button>
        ))}
      </div>

      <div id="tab-panel" role="tabpanel" aria-label={tab} data-testid={`panel-${tab}`} className="space-y-4">
        {step1Failed && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">Step 1 failed, so steps 2–6 ran without reference apps or screen descriptions.</p>}

        {tab === "Overview" && (o.lead ? (
          <>
            <div className={card}>
              <h3 className={h3}>Executive summary</h3>
              <p className="mt-2 max-w-3xl">{o.lead.summary}</p>
              {o.lead.gaps && <p className="mt-2 text-sm text-warn">{o.lead.gaps}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {o.lead.scores.map((s) => (
                <div key={s.screenRef} className={card}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className={h3}>{review.images.find((i) => i.id === s.screenRef)?.label ?? `Screen ${s.screenRef}`}</h3>
                    <span className="font-display text-3xl font-extrabold tabular-nums">{s.overall}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <ScoreBar label="Visual design" value={s.visual} />
                    <ScoreBar label="Usability" value={s.usability} />
                    <ScoreBar label="Accessibility" value={s.accessibility} />
                    <ScoreBar label="Market fit" value={s.marketFit} />
                  </div>
                </div>
              ))}
            </div>
            <div className={card}>
              <h3 className={h3}>Ranked fixes</h3>
              <ol className="mt-3 space-y-3">
                {o.lead.fixes.map((f) => (
                  <li key={f.rank} className="flex gap-3 rounded-lg border border-line p-3">
                    <span className="pin shrink-0">{f.rank}</span>
                    <div className="min-w-0">
                      <p className="font-semibold">{f.action}</p>
                      <p className="text-muted">{f.why}</p>
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        <span className="font-semibold text-pen">{f.priority}</span>
                        <span>Impact {f.impact}</span><span>Effort {f.effort}</span><span>Owner {f.owner}</span><span>Screen {f.screenRef}</span>
                        <span className="text-muted">Found by {f.foundBy.map((s) => STEP_NAME[s] ?? s).join(", ")}</span>
                        {f.drawsOn && <span className="text-muted">Draws on {f.drawsOn}</span>}
                      </p>
                      <Citations ids={f.citations} />
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className={card}>
              <h3 className={h3}>Quick wins</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">{o.lead.quickWins.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          </>
        ) : <Missing what="The lead reviewer" />)}

        {tab === "Visual" && (o.visual ? (
          <>
            <div className={card}>
              <h3 className={h3}>Craft scorecard</h3>
              <p className="mt-1 text-sm text-muted">Uses the principles of Anthropic&apos;s frontend-design skill as a review lens, judged against this product&apos;s subject and audience.</p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {([["Distinctiveness", o.visual.craft.distinctiveness], ["Typography", o.visual.craft.typography], ["Color system", o.visual.craft.colorSystem], ["Structure", o.visual.craft.structure], ["Restraint", o.visual.craft.restraint], ["UX writing", o.visual.craft.uxWriting]] as const).map(([label, s]) => (
                  <div key={label}><ScoreBar label={label} value={s.score} max={5} /><p className="mt-1 text-sm text-muted">{s.note}</p></div>
                ))}
              </div>
              <p className="mt-4 text-sm"><span className="font-semibold">Templated look: </span>{o.visual.craft.templatedLook}</p>
              <p className="text-sm"><span className="font-semibold">Signature element: </span>{o.visual.craft.signatureElement}</p>
            </div>
            {o.visual.screens.map((s) => (
              <div key={s.screenRef} className={card}>
                <h3 className={h3}>Screen {s.screenRef}</h3>
                <dl className="mt-2 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {([["Layout and grid", s.layout], ["Spacing", s.spacing], ["Typography", s.typography], ["Visual hierarchy", s.hierarchy]] as const).map(([k, v]) => (
                    <div key={k}><dt className="font-semibold">{k}</dt><dd className="text-muted">{v}</dd></div>
                  ))}
                </dl>
                <p className="mt-3 text-sm font-semibold">Colour palette (approximate)</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {s.palette.map((c, i) => (
                    <li key={i} className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs">
                      <span className="size-4 rounded border border-line" style={{ background: /^#[0-9a-f]{3,8}$/i.test(c.hex) ? c.hex : "transparent" }} aria-hidden="true" />
                      <span className="font-mono">{c.hex}</span> <span className="text-muted">{c.role}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm"><span className="font-semibold">Components: </span>{s.components.join(", ")}</p>
              </div>
            ))}
            <div className={card}><h3 className={`${h3} mb-3`}>Visual issues</h3><IssueList issues={o.visual.issues} /></div>
            <Retrieved chunks={review.retrieved.visual} />
          </>
        ) : <Missing what="Visual analysis" />)}

        {tab === "UX critique" && (o.ux ? (
          <>
            <div className={card}>
              <h3 className={h3}>Nielsen&apos;s 10 heuristics (1–5)</h3>
              <div className={tableWrap}>
                <table className="mt-3 w-full min-w-[520px] text-sm">
                  <thead><tr><th className={th}>Heuristic</th>{o.ux.screens.map((s) => <th key={s.screenRef} className={th}>Screen {s.screenRef}</th>)}</tr></thead>
                  <tbody>
                    {(o.ux.screens[0]?.heuristics ?? []).map((h, row) => (
                      <tr key={h.heuristic}>
                        <td className={td}>{h.heuristic}</td>
                        {o.ux!.screens.map((s) => {
                          const v = s.heuristics[row];
                          return <td key={s.screenRef} className={td} title={v?.note}><span className="font-semibold tabular-nums">{v?.score ?? "–"}</span><span className="block text-xs text-muted">{v?.note}</span></td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={card}><h3 className={`${h3} mb-3`}>Usability issues</h3><IssueList issues={o.ux.issues} filterable /></div>
            <Retrieved chunks={review.retrieved.ux} />
          </>
        ) : <Missing what="UX critique" />)}

        {tab === "Accessibility" && (o.a11y ? (
          <>
            <div className={card}>
              <h3 className={h3}>Measurements</h3>
              <p className="mt-1 text-sm text-muted">Contrast is measured from the screenshot pixels with the WCAG 2.2 formula. Borderline means a fail within 15% of the threshold, which anti-aliasing on thin text can cause; check those colours in code. Target sizes are estimates, assuming a 390 px-wide viewport for portrait screenshots and 1440 px for landscape.</p>
              <div className={tableWrap}>
                <table className="mt-3 w-full min-w-[720px] text-sm" data-testid="measurements">
                  <thead><tr>{["Screen", "Element", "Role", "Colours", "Ratio", "Needs", "Contrast", "Est. size", "Target"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {o.a11y.measurements.map((m) => (
                      <tr key={m.elementId}>
                        <td className={td}>{m.screenRef}</td>
                        <td className={`${td} max-w-[220px]`}>{m.text}</td>
                        <td className={td}>{m.role}</td>
                        <td className={td}>{m.fg && m.bg ? (
                          <span className="flex items-center gap-1 font-mono text-xs">
                            <span className="size-3.5 rounded-sm border border-line" style={{ background: m.fg }} aria-hidden="true" />{m.fg}
                            <span className="text-muted">on</span>
                            <span className="size-3.5 rounded-sm border border-line" style={{ background: m.bg }} aria-hidden="true" />{m.bg}
                          </span>) : <span className="text-muted">n/a</span>}</td>
                        <td className={`${td} font-semibold tabular-nums`}>{m.ratio ? `${m.ratio.toFixed(2)}:1` : "n/a"}</td>
                        <td className={`${td} tabular-nums`}>{m.required}:1</td>
                        <td className={td}>{isBorderline(m) ? <span className="font-semibold text-warn">Borderline</span> : yesNo(m.contrastPass)}</td>
                        <td className={`${td} tabular-nums`}>{m.estSize ? `~${m.estSize.w}×${m.estSize.h} px` : ""}</td>
                        <td className={td}>{m.sizePass === null ? "" : yesNo(m.sizePass)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={card}><h3 className={`${h3} mb-3`}>Accessibility issues</h3><IssueList issues={o.a11y.issues} filterable /></div>
            <Retrieved chunks={review.retrieved.a11y} />
          </>
        ) : <Missing what="Accessibility" />)}

        {tab === "Market" && (o.market ? (
          <>
            {o.market.note && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{o.market.note}</p>}
            <div className="grid gap-4 lg:grid-cols-3">
              {o.market.competitors.map((c) => (
                <article key={c.name} className={card}>
                  <p className="text-sm font-semibold text-pen">Competitor {c.rank}</p>
                  <h3 className={h3}>{c.name}</h3>
                  <a href={c.website} target="_blank" rel="noopener noreferrer" className="break-all text-sm underline">{c.website}</a>
                  <p className="mt-2 text-sm">{c.positioning}</p>
                  {c.pricing && <p className="mt-2 text-sm"><span className="font-semibold">Pricing: </span>{c.pricing}</p>}
                  {([["Key features", c.keyFeatures], ["UI/UX patterns", c.uiPatterns], ["Strengths", c.strengths], ["Weaknesses", c.weaknesses]] as const).map(([k, list]) => list.length > 0 && (
                    <div key={k} className="mt-2 text-sm"><p className="font-semibold">{k}</p><ul className="list-disc pl-5 text-muted">{list.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  ))}
                  <Citations ids={c.sources} />
                </article>
              ))}
            </div>
            <div className={card}>
              <h3 className={h3}>Trends</h3>
              <ul className="mt-2 space-y-2">{o.market.trends.map((t, i) => <li key={i}><span className="font-semibold">{t.trend}. </span>{t.detail}<Citations ids={[t.source]} /></li>)}</ul>
            </div>
            {o.market.featureGap.length > 0 && (
              <div className={card}>
                <h3 className={h3}>Feature-gap matrix</h3>
                <div className={tableWrap}>
                  <table className="mt-3 w-full min-w-[520px] text-sm">
                    <thead><tr><th className={th}>Feature</th><th className={th}>Our product</th>{o.market.competitors.map((c) => <th key={c.name} className={th}>{c.name}</th>)}</tr></thead>
                    <tbody>
                      {o.market.featureGap.map((r) => (
                        <tr key={r.feature}>
                          <td className={td}>{r.feature}</td>
                          <td className={`${td} font-semibold`}>{r.ours}</td>
                          {o.market!.competitors.map((c) => <td key={c.name} className={td}>{r.competitors.find((x) => x.name === c.name)?.has ?? "unknown"}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className={card}>
              <h3 className={h3}>Differentiation opportunities</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">{o.market.opportunities.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
            <details className={card}>
              <summary className="min-h-8 cursor-pointer font-semibold">Search trace: {o.market.trace.searches} web searches, {o.market.trace.citedUrls.length} cited URLs</summary>
              <ul className="mt-2 space-y-1 text-sm">{o.market.trace.citedUrls.map((c) => <li key={c.url} className="break-all"><a href={c.url} target="_blank" rel="noopener noreferrer" className="underline">{c.title}</a></li>)}</ul>
            </details>
          </>
        ) : <Missing what="Market research" />)}

        {tab === "Comparison" && (o.compare ? (
          <div className={card}>
            <h3 className={h3}>{o.compare.mode === "screens" ? "Stronger screen in each area" : "Your screen compared with similar apps"}</h3>
            <p className="mt-1 text-sm text-muted">{o.compare.note}</p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {o.compare.picks.map((p) => (
                <li key={p.area} className="rounded-lg border border-line p-3">
                  <p className="text-sm capitalize text-muted">{p.area}</p>
                  <p className="font-display text-lg font-bold">{/^[ABC]$/.test(p.winner) ? review.images.find((i) => i.id === p.winner)?.label ?? `Screen ${p.winner}` : p.winner}</p>
                  <p className="text-sm">{p.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : <Missing what="Design comparison" />)}

        {tab === "Similar apps" && (o.search ? (
          <div className={card}>
            <h3 className={h3}>Similar, well-rated apps</h3>
            <p className="mt-1 text-sm text-muted">Category: {o.search.productCategory}. Audience: {o.search.likelyAudience}. Links only; no third-party images are shown.</p>
            {o.search.similarApps.length === 0 && <p className="mt-3 text-muted">The search didn&apos;t return similar apps with a cited source.</p>}
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {o.search.similarApps.map((a) => (
                <li key={a.name} className="rounded-lg border border-line p-3">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="font-display text-lg font-bold underline">{a.name}</a>
                  <p className="text-sm text-muted">{a.platform}{a.rating ? `, rated ${a.rating}` : ""}</p>
                  <p className="mt-1 text-sm">{a.whySimilar}</p>
                  <Citations ids={[a.sourceUrl]} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">{o.search.trace.searches} web searches, {o.search.trace.citedUrls.length} cited URLs.</p>
          </div>
        ) : <Missing what="Image search" />)}
      </div>
    </section>
  );
}
