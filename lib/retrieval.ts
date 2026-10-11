// Image RAG retrieval in the browser: ~800-char chunks with 100-char overlap and a tiny BM25 index.
import { KNOWLEDGE } from "./knowledge";
import type { ProductContext, RetrievedChunk, SearchOutput } from "./steps";

export type Doc = { id: string; title: string; text: string };

export function chunk(doc: Doc, size = 800, overlap = 100): Doc[] {
  if (doc.text.length <= size) return [doc];
  const out: Doc[] = [];
  for (let start = 0, i = 1; start < doc.text.length; start += size - overlap, i++) {
    out.push({ id: `${doc.id}#${i}`, title: doc.title, text: doc.text.slice(start, start + size) });
    if (start + size >= doc.text.length) break;
  }
  return out;
}

const STOP = new Set("a an and are as at be by for from has have in is it its of on or that the to was were will with this these those your you their they our can not but should".split(" "));
const tokenize = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g)?.filter((t) => t.length > 1 && !STOP.has(t)) ?? [];

export class BM25 {
  private docs: { doc: Doc; tf: Map<string, number>; len: number }[] = [];
  private df = new Map<string, number>();
  private avgLen = 0;

  constructor(docs: Doc[], private k1 = 1.2, private b = 0.75) {
    for (const doc of docs) {
      const tokens = tokenize(`${doc.title} ${doc.text}`);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      this.docs.push({ doc, tf, len: tokens.length });
    }
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  search(query: string, k = 8, filter?: (d: Doc) => boolean): RetrievedChunk[] {
    const terms = [...new Set(tokenize(query))];
    const N = this.docs.length;
    return this.docs
      .filter((d) => !filter || filter(d.doc))
      .map(({ doc, tf, len }) => {
        let score = 0;
        for (const t of terms) {
          const f = tf.get(t);
          if (!f) continue;
          const n = this.df.get(t) ?? 0;
          const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
          score += idf * ((f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * len) / this.avgLen)));
        }
        return { id: doc.id, title: doc.title, text: doc.text, score: Math.round(score * 100) / 100 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

// Build the index from the knowledge base plus step 1's screen descriptions, then retrieve top 8 per step.
export function retrieveForSteps(search: SearchOutput | undefined, context: ProductContext) {
  const docs: Doc[] = KNOWLEDGE.flatMap((e) => chunk(e));
  for (const s of search?.screens ?? []) {
    docs.push(...chunk({ id: `screen-${s.screenRef}`, title: `Screen ${s.screenRef} description`, text: s.retrievalDescription }));
  }
  const index = new BM25(docs);
  const base = [context.product, context.audience, search?.productCategory, search?.likelyAudience, ...(search?.screens.map((s) => s.retrievalDescription) ?? [])]
    .filter(Boolean)
    .join(" ");

  const isWcag = (d: Doc) => d.id.startsWith("wcag-") || d.id.startsWith("screen-");
  const notCraft = (d: Doc) => !d.id.startsWith("craft-");
  return {
    visual: index.search(`layout grid spacing colour palette typography type scale visual hierarchy alignment proximity similarity ${base}`, 8, notCraft),
    ux: index.search(`usability heuristics navigation feedback status error prevention recognition consistency forms empty states call to action ${base}`, 8, notCraft),
    a11y: index.search(`WCAG contrast ratio text large text non-text icon target size labels focus colour ${base}`, 8, isWcag),
  };
}

export const CRAFT_ENTRIES = KNOWLEDGE.filter((e) => e.id.startsWith("craft-"));
