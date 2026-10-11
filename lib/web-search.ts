// Server only. One Chat Completions call with OpenRouter's web search server tool (steps 1 and 5).
// The AI SDK provider doesn't document server tools, so this calls the REST API directly.
import { messageForStatus, type ResolvedKey } from "./keys";
import type { Citation } from "./steps";

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user"; content: string | ContentPart[] };

export type WebSearchResult = { text: string; citations: Citation[]; searches: number };

export async function webSearch(opts: {
  key: ResolvedKey;
  model: string;
  messages: ChatMessage[];
  timeoutMs?: number;
}): Promise<WebSearchResult> {
  const send = () => fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.key.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://designmind-ai.vercel.app",
      "X-Title": "DesignMind AI",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      // Exa returns real page URLs. Gemini's native search engine returns temporary redirect links instead.
      tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", max_results: 5, max_total_results: 15 } }],
      max_tool_calls: 5,
      max_tokens: 8_000, // keeps OpenRouter's up-front credit check small; research notes are well under this
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 70_000),
  });
  // Retry once on a dropped connection ("fetch failed"), but not on timeouts or HTTP errors.
  const res = await send().catch((err) => {
    if (err instanceof TypeError) return send();
    throw err;
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw messageForStatus(res.status, opts.key.keySource, detail.slice(0, 2000));
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message ?? {};
  const text: string = typeof message.content === "string"
    ? message.content
    : Array.isArray(message.content) ? message.content.map((p: { text?: string }) => p.text ?? "").join("") : "";

  return { text, citations: collectCitations(message.annotations, text), searches: Number(data?.usage?.server_tool_use?.web_search_requests ?? data?.usage?.server_tool_use_details?.web_search_requests ?? 0) };
}

// url_citation annotations can come nested ({ url_citation: { url, title } }) or flat ({ url, title }).
function collectCitations(annotations: unknown, text: string): Citation[] {
  const seen = new Map<string, Citation>();
  if (Array.isArray(annotations)) {
    for (const a of annotations) {
      if (a?.type !== "url_citation") continue;
      const c = a.url_citation ?? a;
      if (typeof c?.url === "string" && /^https?:\/\//.test(c.url) && !seen.has(c.url)) {
        seen.set(c.url, { url: c.url, title: String(c.title ?? c.url) });
      }
    }
  }
  // Some search engines put sources only in the text as markdown links.
  if (seen.size === 0) {
    for (const m of text.matchAll(/\[([^\]]{1,200})\]\((https?:\/\/[^)\s]+)\)/g)) {
      if (!seen.has(m[2])) seen.set(m[2], { url: m[2], title: m[1] });
    }
  }
  return [...seen.values()];
}

// A URL counts as cited if it was returned by the search, or shares a host with a returned URL.
export function isCited(url: string | null | undefined, citations: Citation[]): boolean {
  if (!url) return false;
  const norm = (u: string) => u.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const n = norm(url);
  const h = host(url);
  return citations.some((c) => norm(c.url) === n || (h !== "" && host(c.url) === h));
}
