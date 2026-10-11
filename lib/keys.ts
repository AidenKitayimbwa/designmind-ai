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
  return { status: 500, message: "Something went wrong while reaching OpenRouter. Check your connection and click Retry.", code: "network" };
}

// Ask OpenRouter about a key (never returns the key): its last 3 characters, owner type, limit and spend.
// Used to explain credit errors, because a key can have its own cap separate from the account balance.
export type KeyFacts = { ending: string; organization: string | null; limit: number | null; used: number; remaining: number | null };

export async function keyFacts(apiKey: string): Promise<KeyFacts | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const { data } = await res.json();
    return {
      ending: apiKey.slice(-3),
      organization: typeof data?.organization_id === "string" ? data.organization_id : null,
      limit: typeof data?.limit === "number" ? data.limit : null,
      used: Number(data?.usage ?? 0),
      remaining: typeof data?.limit_remaining === "number" ? data.limit_remaining : null,
    };
  } catch {
    return null;
  }
}

export function describeKey(f: KeyFacts): string {
  const owner = f.organization ? `a key of organisation ${f.organization.slice(0, 12)}...` : "a personal key";
  const cap = f.limit === null ? "no spending limit" : `a $${f.limit.toFixed(2)} spending limit, $${f.used.toFixed(2)} used`;
  return `Key ending ...${f.ending} is ${owner} with ${cap}.`;
}
