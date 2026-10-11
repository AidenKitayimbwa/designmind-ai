// Server only. System prompts, Zod output schemas and the run function for each of the 7 steps.
import { generateText, Output, NoObjectGeneratedError, type ModelMessage } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { AppError, type ResolvedKey } from "./keys";
import { isCited, webSearch, type ContentPart } from "./web-search";
import { CRAFT_ENTRIES } from "./retrieval";
import type {
  A11yModelOutput, Box, CompareOutput, Issue, LeadOutput, MarketOutput, ProductContext,
  RetrievedChunk, ScreenRef, SearchOutput, StepId, UxOutput, VisualOutput,
} from "./steps";

// ---------- shared schema pieces ----------
// Schemas avoid min/max constraints so more models accept them; code normalizes values afterwards.
const screenRef = z.enum(["A", "B", "C"]);
// Named corners are unambiguous across models (Gemini otherwise mixes in its native [ymin, xmin, ymax, xmax]).
const box = z.object({
  xmin: z.number(), ymin: z.number(), xmax: z.number(), ymax: z.number(),
}).describe("Bounding box corners in 0–1000 coordinates relative to the image; (0,0) is the top-left corner, (1000,1000) the bottom-right");
const issue = z.object({
  id: z.string(),
  screenRef,
  box,
  principle: z.string(),
  severity: z.enum(["critical", "major", "minor"]),
  evidence: z.string().describe("What is visible on the screen that shows the problem"),
  recommendation: z.string().describe("A specific, actionable fix"),
  effort: z.enum(["S", "M", "L"]),
  citations: z.array(z.string()).describe("IDs of the retrieved context chunks this finding relies on"),
});
const craftScore = z.object({ score: z.number().describe("1–5"), note: z.string() });

export const schemas = {
  search: z.object({
    screens: z.array(z.object({ screenRef, retrievalDescription: z.string().describe("Dense 150–250 word description") })),
    productCategory: z.string(),
    likelyAudience: z.string(),
    summary: z.string().describe("2–3 sentences on what the product is and what the screens show"),
    similarApps: z.array(z.object({
      name: z.string(),
      url: z.string().describe("Website or app-store URL"),
      platform: z.string(),
      rating: z.string().nullable().describe("Only if a search result states it, else null"),
      whySimilar: z.string(),
      sourceUrl: z.string().describe("One of the cited source URLs"),
    })),
  }),
  visual: z.object({
    screens: z.array(z.object({
      screenRef,
      layout: z.string(),
      spacing: z.string(),
      palette: z.array(z.object({ hex: z.string(), role: z.string() })),
      typography: z.string(),
      hierarchy: z.string(),
      components: z.array(z.string()),
    })),
    craft: z.object({
      distinctiveness: craftScore,
      typography: craftScore,
      colorSystem: craftScore,
      structure: craftScore,
      restraint: craftScore,
      uxWriting: craftScore,
      templatedLook: z.enum(["none", "cream-serif-terracotta", "dark-single-acid-accent", "broadsheet-hairline"]),
      signatureElement: z.string().describe("The one thing the design will be remembered by, or 'none'"),
    }),
    issues: z.array(issue),
  }),
  ux: z.object({
    screens: z.array(z.object({
      screenRef,
      heuristics: z.array(z.object({ heuristic: z.string(), score: z.number().describe("1–5"), note: z.string() })),
    })),
    issues: z.array(issue),
  }),
  a11y: z.object({
    elements: z.array(z.object({
      id: z.string(),
      screenRef,
      box,
      role: z.enum(["body text", "heading", "label", "button", "link", "icon button", "input"]),
      text: z.string().describe("Visible text, or a short description for icons"),
    })),
    issues: z.array(issue),
  }),
  market: z.object({
    competitors: z.array(z.object({
      rank: z.number(),
      name: z.string(),
      website: z.string(),
      positioning: z.string(),
      keyFeatures: z.array(z.string()),
      pricing: z.string().nullable(),
      uiPatterns: z.array(z.string()),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
      sources: z.array(z.string()).describe("Cited URLs from the research notes"),
    })),
    trends: z.array(z.object({ trend: z.string(), detail: z.string(), source: z.string() })),
    featureGap: z.array(z.object({
      feature: z.string(),
      ours: z.enum(["yes", "no", "partial", "unknown"]),
      competitors: z.array(z.object({ name: z.string(), has: z.enum(["yes", "no", "partial", "unknown"]) })),
    })),
    opportunities: z.array(z.string()),
    note: z.string().nullable(),
  }),
  compare: z.object({
    note: z.string(),
    picks: z.array(z.object({
      area: z.enum(["visual design", "usability", "accessibility", "clarity of purpose"]),
      winner: z.string().describe("Screen letter (A/B/C) or app name"),
      reason: z.string().describe("One line"),
    })),
  }),
  lead: z.object({
    summary: z.string().describe("Executive summary, 3–5 sentences"),
    fixes: z.array(z.object({
      rank: z.number(),
      priority: z.enum(["P0", "P1", "P2"]),
      action: z.string(),
      why: z.string(),
      impact: z.enum(["high", "med", "low"]),
      effort: z.enum(["S", "M", "L"]),
      owner: z.enum(["design", "dev", "product"]),
      screenRef,
      box,
      foundBy: z.array(z.enum(["search", "visual", "ux", "a11y", "market", "compare"])),
      sourceIds: z.array(z.string()).describe("IDs of the findings merged into this fix, e.g. vis-2, ux-1, a11y-c-3"),
      drawsOn: z.string().nullable().describe("Competitor or similar app this fix draws on, if any"),
      citations: z.array(z.string()).describe("Every chunk ID or URL from the merged findings"),
    })),
    scores: z.array(z.object({
      screenRef,
      visual: z.number(), usability: z.number(), accessibility: z.number(), marketFit: z.number(), overall: z.number(),
    })),
    quickWins: z.array(z.string()),
    gaps: z.string().nullable().describe("Which steps failed or were skipped, else null"),
  }),
};

// ---------- system prompts ----------
const BOX_RULE = "Every finding that points at part of a screen must include screenRef (the screen letter) and box: the xmin, ymin, xmax and ymax corners in 0–1000 coordinates relative to that image, where (0,0) is the top-left corner. Keep the box tight around the element.";
const ISSUE_RULE = `${BOX_RULE} Give each issue a short id, a severity (critical blocks the task or excludes users; major causes real friction; minor is polish), concrete visible evidence, a specific recommendation and an effort (S under a day, M a few days, L longer). Cite the IDs of retrieved context chunks you relied on in citations; cite only IDs that were given to you.`;

export const prompts: Record<StepId | "searchResearch" | "marketResearch", string> = {
  searchResearch: "You are the reference-search agent of DesignMind AI, a design review tool. Look at the user's product screenshots. First describe each screen densely (layout, components, visible text, colours, purpose). Then infer the product category and likely audience. Then use web search to find up to 5 real, well-rated apps or websites whose screens are similar to the user's (same category, comparable layout or flow). For each, report the name, website or app-store URL, platform, a rating only if a search result states it, why it's similar, and the source URL. Never invent apps, ratings or URLs.",
  search: `You turn research notes about a product's screenshots into structured data. For each screen, write retrievalDescription: a dense, factual 150–250 word description of the screen's purpose, layout, components, visible copy, colours and states, so it can be retrieved by keyword search. Infer productCategory and likelyAudience (use the provided context when given). List similar apps only if they appear in the notes, and set sourceUrl to one of the listed cited URLs. Set rating to null unless the notes state it. Never invent apps or URLs.`,
  visual: `You are the visual-analysis agent of DesignMind AI. For each screen, analyse layout and grid, spacing, colour palette (approximate hex values with roles), typography, visual hierarchy and a component inventory. Then do a design-craft review using the craft-* principles provided as the lens: score 1–5 for distinctiveness (made for this product, not templated), typography (deliberate pairing, clear scale), colorSystem (coherent palette of 4–6 colours), structure (numbering, labels and dividers carry meaning), restraint (one signature element, no decoration that doesn't serve the product) and uxWriting (specific active labels, consistent action names, errors that say how to fix, empty states that invite action). Set templatedLook to the closest common generated look or none, and name the signatureElement or 'none'. Judge craft against the product's own subject and audience, not personal taste. ${ISSUE_RULE} Use the design principle as principle.`,
  ux: `You are the UX-critique agent of DesignMind AI. Score every screen 1–5 on each of Nielsen's 10 usability heuristics (use the heuristic names exactly: Visibility of system status; Match between system and the real world; User control and freedom; Consistency and standards; Error prevention; Recognition rather than recall; Flexibility and efficiency of use; Aesthetic and minimalist design; Help users recognize, diagnose and recover from errors; Help and documentation) with a one-line note. Then list usability issues. ${ISSUE_RULE} Use the heuristic name as principle.`,
  a11y: `You are the accessibility agent of DesignMind AI. For each screen, find up to 25 important text elements and interactive targets: body text, headings, labels, buttons, links, icon buttons and inputs. For each, return a tight box around the element (including its background shape for buttons), its role and its visible text. Prefer elements whose contrast may be weak, small targets and primary actions. Do NOT judge colour contrast: contrast is measured from the pixels by code. Separately list other visible accessibility problems as issues, such as icon buttons with no visible label, placeholder-only inputs, colour-only meaning or missing focus cues. ${ISSUE_RULE} Use the WCAG criterion as principle.`,
  marketResearch: "You are the market-research agent of DesignMind AI. Use web search to identify the top 3 direct competitors of the product described, and current design and market trends in its category. For each competitor give its website, positioning, key features, pricing if found, notable UI/UX patterns, strengths and weaknesses. Cite sources for every claim. If you can't find 3 credible direct competitors, say so and list only those you found. Never invent a competitor.",
  market: "You turn market-research notes into structured data. Use only facts from the notes. Every competitor and trend must cite URLs from the provided list of cited URLs; drop any claim you can't tie to one. Rank competitors 1–3 (fewer if fewer were found; never invent one). Build a feature-gap matrix comparing our product (from the context and screen summary) with each competitor using yes, no, partial or unknown. List 2–4 differentiation opportunities. Use note to say if fewer than 3 credible competitors were found, else null.",
  compare: `You are the design-comparison agent of DesignMind AI. When given 2–3 screens, pick the stronger screen in each area: visual design, usability, accessibility and clarity of purpose, with a one-line reason each; winner is the screen letter. When given 1 screen, compare it with the similar apps listed instead (winner is either 'A' or the app's name), and say so in note. If no similar apps are listed, compare it with common conventions for its category, never name specific apps, and say so in note. Be specific about what makes the winner stronger.`,
  lead: `You are the lead reviewer of DesignMind AI. You receive the outputs of the other agents and the pixel-measured accessibility results. Remove repeated findings, keeping the clearest wording and every citation. Rank the fixes by impact on users and the business (at most 15). Each fix needs rank, priority (P0 must fix, P1 should fix, P2 nice to have), action, why, impact, effort, owner, screenRef, sourceIds (the ids of the findings you merged, so the fix can be pinned where they were found), box (copy it from the source finding when you have no source id), foundBy (the steps that found it) and drawsOn (a competitor or similar app it draws on, or null). Contrast numbers must come from the measurements, never be estimated. Score each screen 0–100 on visual design, usability, accessibility and market fit, plus overall. Write a 3–5 sentence executive summary and list quick wins that take under a day each. If steps are missing, say which in gaps and don't make up their findings.`,
};

// ---------- helpers ----------
type ImageIn = { id: ScreenRef; src: string };

function modelFor(key: ResolvedKey, model: string) {
  return createOpenRouter({ apiKey: key.apiKey, headers: { "HTTP-Referer": "https://designmind-ai.vercel.app", "X-Title": "DesignMind AI" } })(model);
}

function userMessage(text: string, images: ImageIn[] = []): ModelMessage {
  return {
    role: "user",
    content: [
      { type: "text", text },
      ...images.flatMap((img) => [
        { type: "text" as const, text: `Screen ${img.id}:` },
        { type: "file" as const, mediaType: "image/jpeg", data: img.src },
      ]),
    ],
  };
}

// Structured output with one retry when the answer doesn't match the schema.
async function structured<T extends z.ZodTypeAny>(key: ResolvedKey, model: string, system: string, message: ModelMessage, schema: T, deadline = Date.now() + 110_000): Promise<z.infer<T>> {
  const call = async () => {
    const remaining = deadline - Date.now();
    if (remaining < 5_000) throw new AppError(504, "The step ran out of time. Click Retry.", "timeout");
    const result = await generateText({
      model: modelFor(key, model),
      system,
      messages: [message],
      output: Output.object({ schema }),
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(remaining),
    });
    return result.output as z.infer<T>;
  };
  try {
    return await call();
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) return await call();
    throw err;
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

type BoxIn = { xmin: number; ymin: number; xmax: number; ymax: number } | number[] | undefined;

// Convert model corners to the stored [x, y, width, height] in 0–1000.
export function normalizeBox(raw: BoxIn): Box {
  if (Array.isArray(raw)) {
    const [x = 0, y = 0, w = 1, h = 1] = raw.map(Number);
    return normalizeBox({ xmin: x, ymin: y, xmax: x + w, ymax: y + h });
  }
  let c = [raw?.xmin, raw?.ymin, raw?.xmax, raw?.ymax].map((v) => Number(v ?? 0));
  if (c.every((v) => v <= 1)) c = c.map((v) => v * 1000); // model used 0–1 coordinates
  const [x0, x1] = [Math.min(c[0], c[2]), Math.max(c[0], c[2])].map((v) => clamp(v, 0, 1000));
  const [y0, y1] = [Math.min(c[1], c[3]), Math.max(c[1], c[3])].map((v) => clamp(v, 0, 1000));
  return [Math.round(x0), Math.round(y0), Math.max(1, Math.round(x1 - x0)), Math.max(1, Math.round(y1 - y0))];
}

function refFor(ref: string, images: { id: ScreenRef }[]): ScreenRef {
  return (images.find((i) => i.id === ref)?.id ?? images[0]?.id ?? "A") as ScreenRef;
}

function cleanIssues(issues: (Omit<Issue, "box"> & { box: BoxIn })[], prefix: string, images: { id: ScreenRef }[], allowedCitations: Set<string>): Issue[] {
  return issues.map((i, n) => ({
    ...i,
    id: `${prefix}-${n + 1}`,
    screenRef: refFor(i.screenRef, images),
    box: normalizeBox(i.box),
    citations: (i.citations ?? []).filter((c) => allowedCitations.has(c)),
  }));
}

function chunkText(chunks: RetrievedChunk[]) {
  return chunks.map((c) => `[${c.id}] ${c.title}: ${c.text}`).join("\n");
}

function contextText(ctx: ProductContext | undefined, search?: Partial<SearchOutput> | null, withStep1 = true) {
  const lines = [
    `Product: ${ctx?.product || search?.productCategory || "not given"}`,
    `Website: ${ctx?.website || "not given"}`,
    `Audience: ${ctx?.audience || search?.likelyAudience || "not given"}`,
  ];
  if (withStep1) lines.push(search?.summary ? `Screen summary (from step 1): ${search.summary}` : "Step 1 (reference search) is unavailable: no reference apps or screen descriptions.");
  return lines.join("\n");
}

// ---------- the 7 steps ----------
export type AgentBody = {
  model: string;
  images?: ImageIn[];
  context?: ProductContext;
  search?: SearchOutput | null;
  chunks?: RetrievedChunk[];
  outputs?: Record<string, unknown>;
  missing?: StepId[];
  screenRefs?: ScreenRef[];
};

export async function runAgent(agent: StepId, body: AgentBody, key: ResolvedKey): Promise<unknown> {
  const { model } = body;
  const images = (body.images ?? []).slice(0, 3);
  const needsImages = agent !== "market" && agent !== "lead";
  if (needsImages && images.length === 0) throw new AppError(400, "Add at least one screenshot.", "no_images");
  const chunks = body.chunks ?? [];
  const chunkIds = new Set(chunks.map((c) => c.id));
  const deadline = Date.now() + 112_000; // stay inside the route's maxDuration of 120 s

  switch (agent) {
    case "search": {
      const research = await webSearch({
        key, model,
        messages: [
          { role: "system", content: prompts.searchResearch },
          {
            role: "user",
            content: [
              { type: "text", text: contextText(body.context, null, false) },
              ...images.flatMap((img): ContentPart[] => [
                { type: "text", text: `Screen ${img.id}:` },
                { type: "image_url", image_url: { url: img.src } },
              ]),
            ],
          },
        ],
      });
      const cited = research.citations.map((c) => `- ${c.url} (${c.title})`).join("\n") || "- none";
      const out = await structured(key, model, prompts.search,
        userMessage(`Context:\n${contextText(body.context, null, false)}\n\nResearch notes:\n${research.text}\n\nCited URLs:\n${cited}\n\nScreens provided: ${images.map((i) => i.id).join(", ")}`, images),
        schemas.search, deadline);
      const result: SearchOutput = {
        ...out,
        screens: images.map((img) => ({ screenRef: img.id, retrievalDescription: out.screens.find((s) => s.screenRef === img.id)?.retrievalDescription ?? "" })),
        similarApps: out.similarApps.filter((a) => isCited(a.sourceUrl, research.citations) || isCited(a.url, research.citations)).slice(0, 5),
        trace: { searches: research.searches, citedUrls: research.citations },
      };
      return result;
    }

    case "visual": {
      const out = await structured(key, model, prompts.visual,
        userMessage(`${contextText(body.context, body.search)}\n\nRetrieved context (cite by ID):\n${chunkText(chunks)}\n\nCraft lens (cite by ID):\n${CRAFT_ENTRIES.map((c) => `[${c.id}] ${c.title}: ${c.text}`).join("\n")}\n\nScreens provided: ${images.map((i) => i.id).join(", ")}`, images),
        schemas.visual, deadline);
      const allowed = new Set([...chunkIds, ...CRAFT_ENTRIES.map((c) => c.id)]);
      const fix = (s: { score: number; note: string }) => ({ score: Math.round(clamp(s.score, 1, 5)), note: s.note });
      const result: VisualOutput = {
        screens: out.screens.map((s) => ({ ...s, screenRef: refFor(s.screenRef, images) })),
        craft: {
          ...out.craft,
          distinctiveness: fix(out.craft.distinctiveness), typography: fix(out.craft.typography), colorSystem: fix(out.craft.colorSystem),
          structure: fix(out.craft.structure), restraint: fix(out.craft.restraint), uxWriting: fix(out.craft.uxWriting),
        },
        issues: cleanIssues(out.issues, "vis", images, allowed),
      };
      return result;
    }

    case "ux": {
      const out = await structured(key, model, prompts.ux,
        userMessage(`${contextText(body.context, body.search)}\n\nRetrieved context (cite by ID):\n${chunkText(chunks)}\n\nScreens provided: ${images.map((i) => i.id).join(", ")}`, images),
        schemas.ux, deadline);
      const result: UxOutput = {
        screens: out.screens.map((s) => ({ screenRef: refFor(s.screenRef, images), heuristics: s.heuristics.map((h) => ({ ...h, score: Math.round(clamp(h.score, 1, 5)) })) })),
        issues: cleanIssues(out.issues, "ux", images, chunkIds),
      };
      return result;
    }

    case "a11y": {
      const out = await structured(key, model, prompts.a11y,
        userMessage(`Retrieved WCAG context (cite by ID):\n${chunkText(chunks)}\n\nScreens provided: ${images.map((i) => i.id).join(", ")}`, images),
        schemas.a11y, deadline);
      const perScreen = new Map<string, number>();
      const result: A11yModelOutput = {
        elements: out.elements
          .map((e) => ({ ...e, screenRef: refFor(e.screenRef, images), box: normalizeBox(e.box) }))
          .filter((e) => { const n = (perScreen.get(e.screenRef) ?? 0) + 1; perScreen.set(e.screenRef, n); return n <= 25; })
          .map((e, i) => ({ ...e, id: `el-${i + 1}` })),
        issues: cleanIssues(out.issues, "a11y", images, chunkIds),
      };
      return result; // the browser adds pixel measurements before the step is marked Done
    }

    case "market": {
      const ctx = contextText(body.context, body.search);
      const research = await webSearch({
        key, model,
        messages: [
          { role: "system", content: prompts.marketResearch },
          { role: "user", content: `${ctx}\n\nFind the top 3 direct competitors and current design and market trends in this category.` },
        ],
      });
      const cited = research.citations.map((c) => `- ${c.url} (${c.title})`).join("\n") || "- none";
      const out = await structured(key, model, prompts.market,
        userMessage(`${ctx}\n\nResearch notes:\n${research.text}\n\nCited URLs:\n${cited}`), schemas.market, deadline);
      const competitors = out.competitors
        .map((c) => ({ ...c, sources: c.sources.filter((s) => isCited(s, research.citations)) }))
        .filter((c) => c.sources.length > 0 || isCited(c.website, research.citations))
        .slice(0, 3)
        .map((c, i) => ({ ...c, rank: i + 1 }));
      const names = new Set(competitors.map((c) => c.name));
      const result: MarketOutput = {
        competitors,
        trends: out.trends.filter((t) => isCited(t.source, research.citations)),
        featureGap: out.featureGap.map((r) => ({ ...r, competitors: r.competitors.filter((c) => names.has(c.name)) })),
        opportunities: out.opportunities,
        note: competitors.length < 3
          ? out.note ?? `Only ${competitors.length} credible competitor${competitors.length === 1 ? "" : "s"} with cited sources found.`
          : out.note,
        trace: { searches: research.searches, citedUrls: research.citations },
      };
      return result;
    }

    case "compare": {
      const single = images.length === 1;
      const apps = body.search?.similarApps?.map((a) => `- ${a.name} (${a.platform}): ${a.whySimilar}`).join("\n") || "none available";
      const out = await structured(key, model, prompts.compare,
        userMessage(`${contextText(body.context, body.search)}\n\n${single
          ? `Only 1 screen was provided. Compare it with these similar apps instead and say so:\n${apps}`
          : `Compare these ${images.length} screens: ${images.map((i) => i.id).join(", ")}.`}`, images),
        schemas.compare, deadline);
      const result: CompareOutput = { mode: single ? "similar-apps" : "screens", note: out.note, picks: out.picks };
      return result;
    }

    case "lead": {
      const refs = body.screenRefs?.length ? body.screenRefs : images.map((i) => i.id);
      const out = await structured(key, model, prompts.lead,
        userMessage(`Screens: ${refs.join(", ") || "A"}\nMissing or failed steps: ${body.missing?.length ? body.missing.join(", ") : "none"}\n\nAgent outputs (JSON):\n${JSON.stringify(body.outputs ?? {}).slice(0, 120_000)}`),
        schemas.lead, deadline);
      const imgs = refs.map((id) => ({ id }));
      const score = (n: number) => Math.round(clamp(n, 0, 100));
      // Pin each fix where its source finding was found, instead of trusting re-typed coordinates.
      const located = new Map<string, { screenRef: ScreenRef; box: Box }>();
      for (const step of Object.values(body.outputs ?? {}) as { issues?: Issue[] }[]) {
        for (const i of step?.issues ?? []) located.set(i.id, { screenRef: i.screenRef, box: i.box });
      }
      const result: LeadOutput = {
        ...out,
        fixes: out.fixes.slice(0, 15).map(({ sourceIds, ...f }, i) => {
          const src = sourceIds.map((id) => located.get(id)).find(Boolean);
          return { ...f, rank: i + 1, screenRef: src?.screenRef ?? refFor(f.screenRef, imgs), box: src?.box ?? normalizeBox(f.box) };
        }),
        scores: out.scores.map((s) => ({ screenRef: refFor(s.screenRef, imgs), visual: score(s.visual), usability: score(s.usability), accessibility: score(s.accessibility), marketFit: score(s.marketFit), overall: score(s.overall) })),
      };
      return result;
    }
  }
}
