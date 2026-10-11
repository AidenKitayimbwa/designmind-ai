// Server only. Decides which OpenRouter key a request uses and turns errors into safe messages.

export type KeySource = "outskill" | "user";
export type ResolvedKey = { apiKey: string; keySource: KeySource };

export class AppError extends Error {
  constructor(public status: number, message: string, public code = "error") {
    super(message);
  }
}

export const NOT_CONFIGURED = "Default key not configured. Choose Bring your own key.";

// BYOK header wins. Without it, use the default key. A BYOK request never falls back to the default key.
export function resolveKey(req: Request): ResolvedKey {
  const header = req.headers.get("x-openrouter-key");
  if (header !== null) {
    const key = header.trim();
    if (!key) throw new AppError(401, "Enter your OpenRouter key, or switch back to the default key.", "no_key");
    return { apiKey: key, keySource: "user" };
  }
  const outskill = process.env.OUTSKILL_OPENROUTER_API_KEY?.trim();
  if (!outskill) throw new AppError(500, NOT_CONFIGURED, "not_configured");
  return { apiKey: outskill, keySource: "outskill" };
}

// Remove anything that looks like a key from text before it reaches a log or a response.
export function redact(text: string, ...keys: (string | undefined)[]): string {
  let out = text;
  for (const k of keys) if (k && k.length > 8) out = out.split(k).join("[redacted]");
  return out.replace(/sk-or-[A-Za-z0-9_-]+/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

// Map an HTTP status from OpenRouter to a message the user can act on.
export function messageForStatus(status: number, keySource: KeySource, detail = ""): AppError {
  const d = detail.toLowerCase();
  if (status === 401) {
    return new AppError(401, keySource === "user"
      ? "Your OpenRouter key was rejected (401). Check it with Test key, or switch to the default key."
      : "The default key was rejected (401). Choose Bring your own key to continue.", "invalid_key");
  }
  // OpenRouter keys can carry their own spending limit, separate from the account balance. It answers 402 while
  // the key can't afford a request, and 403 "Key limit exceeded" once the limit is fully used.
  const keyLimit = /openrouter_key_limit|key limit|key's total limit|usage limit/.test(d);
  if (status === 402 || (status === 403 && keyLimit)) {
    const which = keySource === "user" ? "Your OpenRouter key" : "The default key";
    const said = upstreamMessage(detail);
    const quote = said ? ` OpenRouter said: "${said}"` : "";
    return new AppError(402, (keyLimit
      ? `${which} has reached its own credit limit on OpenRouter (402). Your account balance isn't the problem: raise or remove this key's limit at openrouter.ai/settings/keys, then click Retry.`
      : keySource === "user"
        ? "The OpenRouter account or organisation that owns your key is out of credits (402). A key spends its owner's balance, so create the key in the account or organisation that holds your credit, or add credits to this one."
        : "The default key's account is out of credits. Add credits on OpenRouter or choose Bring your own key.") + quote, keyLimit ? "key_limit" : "no_credits");
  }
  if (status === 429) return new AppError(429, "OpenRouter is rate limiting requests (429). Wait a few seconds, then click Retry.", "rate_limited");
  if (status === 413) return new AppError(413, "The screenshots are too large to send (413). Use smaller images.", "too_large");
  const badModel = detail.match(/(\S+) is not a valid model id/i);
  if (badModel) {
    return new AppError(400, `"${badModel[1].slice(0, 80)}" isn't a valid OpenRouter model ID. Start a new review and pick a model under Advanced.`, "invalid_model");
  }
  if (status === 404 || /image|vision|modalit|tool|support/.test(d)) {
    return new AppError(400, "This model can't read images or use web search. Pick a preset under Advanced, such as google/gemini-3.8-flash.", "model_unsupported");
  }
  if (status === 408 || status === 504) return new AppError(504, "The model took too long to answer. Click Retry.", "timeout");
  return new AppError(status >= 400 ? status : 502, `OpenRouter returned an error (${status}). Click Retry.`, "upstream");
}

// Pull OpenRouter's own error text out of a response body, without links or key IDs.
function upstreamMessage(detail: string): string {
  const m = detail.match(/"message"\s*:\s*"([^"]{1,400})"/);
  const text = (m ? m[1] : detail).replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return text.slice(0, 220);
}

// Turn any thrown value into { status, message } with keys removed.
export function toSafeError(err: unknown, resolved?: ResolvedKey): { status: number; message: string; code: string } {
  const key = resolved?.apiKey;
  if (err instanceof AppError) return { status: err.status, message: redact(err.message, key), code: err.code };
  const e = err as { name?: string; statusCode?: number; message?: string; responseBody?: string; lastError?: unknown };
  if (e?.name === "AI_RetryError" && e.lastError) return toSafeError(e.lastError, resolved);
  if (e?.name === "AI_NoObjectGeneratedError") {
    return { status: 502, message: "The model's answer didn't match the expected format, even after a retry. Click Retry or pick another model.", code: "schema" };
  }
  if (typeof e?.statusCode === "number") {
    const mapped = messageForStatus(e.statusCode, resolved?.keySource ?? "outskill", `${e.message ?? ""} ${e.responseBody ?? ""}`);
    return { status: mapped.status, message: mapped.message, code: mapped.code };
  }
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return { status: 504, message: "The request timed out. Click Retry.", code: "timeout" };
  const kind = typeof e?.name === "string" && e.name !== "Error" ? ` (${e.name})` : "";
  return { status: 500, message: `Something went wrong while reaching OpenRouter${kind}. Check your connection and click Retry.`, code: "network" };
}

// Ask OpenRouter about a key (never returns the key): its last 3 characters, owner, and every budget that
// applies to it. A key can have its own limit, a weekly or monthly reset, and workspace guardrails, all
// separate from the owner's credit balance, which pays for everything.
export type Budget = { scope: string; limit: number; spent: number; remaining: number; resets: string | null };
export type KeyFacts = { ending: string; organization: string | null; budgets: Budget[]; binding: Budget | null };

function toBudget(b: Record<string, unknown> | null | undefined): Budget | null {
  if (!b || typeof b.limit_usd !== "number") return null;
  return {
    scope: String(b.scope ?? "limit").replace(/_/g, " "),
    limit: b.limit_usd,
    spent: Number(b.spend_usd ?? 0),
    remaining: Number(b.remaining_usd ?? (b.limit_usd as number) - Number(b.spend_usd ?? 0)),
    resets: typeof b.reset_interval === "string" ? b.reset_interval : null,
  };
}

export async function keyFacts(apiKey: string): Promise<KeyFacts | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const { data } = await res.json();
    let budgets = (Array.isArray(data?.budgets) ? data.budgets : []).map(toBudget).filter(Boolean) as Budget[];
    if (budgets.length === 0 && typeof data?.limit === "number") {
      budgets = [{ scope: "key limit", limit: data.limit, spent: Number(data.usage ?? 0), remaining: Number(data.limit_remaining ?? 0), resets: data.limit_reset ?? null }];
    }
    return {
      ending: apiKey.slice(-3),
      organization: typeof data?.organization_id === "string" ? data.organization_id : null,
      budgets,
      binding: toBudget(data?.effective_budget) ?? budgets.reduce<Budget | null>((m, b) => (!m || b.remaining < m.remaining ? b : m), null),
    };
  } catch {
    return null;
  }
}

const money = (n: number) => `$${n.toFixed(2)}`;

export function describeKey(f: KeyFacts): string {
  const owner = f.organization ? `a key of organisation ${f.organization.slice(0, 12)}...` : "a personal key";
  if (f.budgets.length === 0) return `Key ending ...${f.ending} is ${owner} with no spending limit.`;
  const list = f.budgets.map((b) => `${b.scope}${b.resets ? ` (resets ${b.resets})` : ""}: ${money(b.spent)} of ${money(b.limit)} used`).join("; ");
  return `Key ending ...${f.ending} is ${owner}. Budgets: ${list}.`;
}

// Measure what a key can actually spend right now. Asking for a huge answer makes OpenRouter either run a
// tiny request (the key can spend plenty) or refuse with "can only afford N tokens", which reveals the
// real ceiling: the smaller of the key's budgets and the owner's credit balance.
const PROBE_MODEL = "google/gemini-3.8-flash";
const PROBE_OUTPUT_PRICE = 3.75 / 1_000_000; // USD per output token for the probe model

export async function spendableNow(apiKey: string): Promise<{ usd: number; capped: boolean } | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: PROBE_MODEL, max_tokens: 65_536, messages: [{ role: "user", content: "Reply with OK." }] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return { usd: 65_536 * PROBE_OUTPUT_PRICE, capped: false };
    const text = await res.text();
    const n = text.match(/can only afford (\d+)/i);
    if (n) return { usd: Number(n[1]) * PROBE_OUTPUT_PRICE, capped: true };
    if (/limit exceeded|insufficient|out of credits|never purchased/i.test(text)) return { usd: 0, capped: true };
    return null;
  } catch {
    return null;
  }
}

// Turn the two measurements into one sentence saying what is actually blocking the key.
export function diagnose(f: KeyFacts | null, spend: { usd: number; capped: boolean } | null): string | null {
  if (!spend) return null;
  if (!spend.capped) return "It can spend enough for a full review right now.";
  const allowedByBudgets = f?.binding ? f.binding.remaining : Infinity;
  if (allowedByBudgets <= spend.usd + 0.05) {
    return `It can only spend about ${money(Math.max(0, spend.usd))} right now because of its ${f?.binding?.scope ?? "limit"}${f?.binding?.resets ? ` (resets ${f.binding.resets})` : ""}. Raise that limit on OpenRouter.`;
  }
  return `Its budgets allow ${allowedByBudgets === Infinity ? "unlimited spending" : `${money(allowedByBudgets)} more`}, but OpenRouter will only let it spend about ${money(spend.usd)} right now. So the ${f?.organization ? "organisation" : "personal account"} that owns this key has only about ${money(spend.usd)} of credit. Add credit there, or create the key in the account or organisation that holds your credit.`;
}
