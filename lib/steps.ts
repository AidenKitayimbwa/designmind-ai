// Client-safe step metadata and shared result types (no zod, no prompts).

export type StepId = "search" | "visual" | "ux" | "a11y" | "market" | "compare" | "lead";
export type ScreenRef = "A" | "B" | "C";
export type Box = [number, number, number, number]; // x, y, width, height in 0–1000
export type Severity = "critical" | "major" | "minor";
export type Effort = "S" | "M" | "L";

export const STEPS: { id: StepId; name: string; description: string; parallel: boolean }[] = [
  { id: "search", name: "Image search", description: "Finds screens from real, well-rated apps that look like your design", parallel: false },
  { id: "visual", name: "Visual analysis", description: "Layout, spacing, colour, type and hierarchy", parallel: true },
  { id: "ux", name: "UX critique", description: "Nielsen’s 10 usability heuristics", parallel: true },
  { id: "a11y", name: "Accessibility", description: "Measures contrast and sizes against WCAG 2.2", parallel: true },
  { id: "market", name: "Market research", description: "Searches the web for competitors and trends", parallel: true },
  { id: "compare", name: "Design comparison", description: "Picks the stronger design in each area", parallel: true },
  { id: "lead", name: "Lead reviewer", description: "Removes repeats, ranks the fixes and scores each design", parallel: false },
];

export const STEP_NAME: Record<StepId, string> = Object.fromEntries(STEPS.map((s) => [s.id, s.name])) as Record<StepId, string>;

export const DEFAULT_MODEL = "google/gemini-3.8-flash";
// OpenRouter model IDs look like vendor/model, e.g. google/gemini-3.8-flash (an optional :variant is allowed).
export const isValidModelId = (id: string) => /^[a-z0-9][\w.-]*\/[\w.-]+(:[\w.-]+)?$/i.test(id);

export const MODEL_PRESETS = [
  { id: "google/gemini-3.8-flash", label: "google/gemini-3.8-flash (default)" },
  { id: "anthropic/claude-haiku-5.5", label: "anthropic/claude-haiku-5.5" },
  { id: "openai/gpt-6-luna", label: "openai/gpt-6-luna" },
  { id: "anthropic/claude-sonnet-5.5", label: "anthropic/claude-sonnet-5.5 (higher quality, higher cost)" },
];

export type Issue = {
  id: string;
  screenRef: ScreenRef;
  box: Box;
  principle: string;
  severity: Severity;
  evidence: string;
  recommendation: string;
  effort: Effort;
  citations: string[];
};

export type Citation = { url: string; title: string };

export type SearchOutput = {
  screens: { screenRef: ScreenRef; retrievalDescription: string }[];
  productCategory: string;
  likelyAudience: string;
  summary: string;
  similarApps: {
    name: string;
    url: string;
    platform: string;
    rating: string | null;
    whySimilar: string;
    sourceUrl: string;
  }[];
  trace: { searches: number; citedUrls: Citation[] };
};

export type CraftScore = { score: number; note: string };
export type VisualOutput = {
  screens: {
    screenRef: ScreenRef;
    layout: string;
    spacing: string;
    palette: { hex: string; role: string }[];
    typography: string;
    hierarchy: string;
    components: string[];
  }[];
  craft: {
    distinctiveness: CraftScore;
    typography: CraftScore;
    colorSystem: CraftScore;
    structure: CraftScore;
    restraint: CraftScore;
    uxWriting: CraftScore;
    templatedLook: "none" | "cream-serif-terracotta" | "dark-single-acid-accent" | "broadsheet-hairline";
    signatureElement: string;
  };
  issues: Issue[];
};

export type UxOutput = {
  screens: { screenRef: ScreenRef; heuristics: { heuristic: string; score: number; note: string }[] }[];
  issues: Issue[];
};

export type A11yRole = "body text" | "heading" | "label" | "button" | "link" | "icon button" | "input";
export type A11yElement = { id: string; screenRef: ScreenRef; box: Box; role: A11yRole; text: string };
export type Measurement = {
  elementId: string;
  screenRef: ScreenRef;
  role: A11yRole;
  text: string;
  box: Box;
  ratio: number | null;
  required: number;
  contrastPass: boolean | null;
  fg: string | null;
  bg: string | null;
  estSize: { w: number; h: number } | null;
  sizePass: boolean | null;
};
export type A11yModelOutput = { elements: A11yElement[]; issues: Issue[] };
export type A11yOutput = A11yModelOutput & { measurements: Measurement[] };

export type GapValue = "yes" | "no" | "partial" | "unknown";
export type MarketOutput = {
  competitors: {
    rank: number;
    name: string;
    website: string;
    positioning: string;
    keyFeatures: string[];
    pricing: string | null;
    uiPatterns: string[];
    strengths: string[];
    weaknesses: string[];
    sources: string[];
  }[];
  trends: { trend: string; detail: string; source: string }[];
  featureGap: { feature: string; ours: GapValue; competitors: { name: string; has: GapValue }[] }[];
  opportunities: string[];
  note: string | null;
  trace: { searches: number; citedUrls: Citation[] };
};

export type CompareOutput = {
  mode: "screens" | "similar-apps";
  note: string;
  picks: { area: "visual design" | "usability" | "accessibility" | "clarity of purpose"; winner: string; reason: string }[];
};

export type Fix = {
  rank: number;
  priority: "P0" | "P1" | "P2";
  action: string;
  why: string;
  impact: "high" | "med" | "low";
  effort: Effort;
  owner: "design" | "dev" | "product";
  screenRef: ScreenRef;
  box: Box;
  foundBy: StepId[];
  drawsOn: string | null;
  citations: string[];
};

export type LeadOutput = {
  summary: string;
  fixes: Fix[];
  scores: { screenRef: ScreenRef; visual: number; usability: number; accessibility: number; marketFit: number; overall: number }[];
  quickWins: string[];
  gaps: string | null;
};

export type StepOutputs = {
  search: SearchOutput;
  visual: VisualOutput;
  ux: UxOutput;
  a11y: A11yOutput;
  market: MarketOutput;
  compare: CompareOutput;
  lead: LeadOutput;
};

export type StepStatus = "waiting" | "running" | "done" | "failed";
export type StepState = {
  status: StepStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  keySource?: "outskill" | "user";
};

export type ScreenImage = { id: ScreenRef; label: string; src: string; width: number; height: number };
export type ProductContext = { product: string; website: string; audience: string };
export type RetrievedChunk = { id: string; title: string; text: string; score: number };

export type Review = {
  id: string;
  createdAt: number;
  images: ScreenImage[];
  context: ProductContext;
  model: string;
  keyMode: "outskill" | "byok"; // which option was chosen; the key itself is never stored here
  steps: Record<StepId, StepState>;
  outputs: Partial<StepOutputs>;
  retrieved: Partial<Record<"visual" | "ux" | "a11y", RetrievedChunk[]>>;
};

export function emptySteps(): Record<StepId, StepState> {
  return Object.fromEntries(STEPS.map((s) => [s.id, { status: "waiting" }])) as Record<StepId, StepState>;
}
