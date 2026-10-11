// Server only. Decides which OpenRouter key a request uses and turns errors into safe messages.

export type KeySource = "outskill" | "user";
export type ResolvedKey = { apiKey: string; keySource: KeySource };

export class AppError extends Error {
  constructor(public status: number, message: string, public code = "error") {
    super(message);
  }
}

export const NOT_CONFIGURED = "Outskill key not configured. Choose Bring your own key.";

// BYOK header wins. Without it, use the Outskill key. A BYOK request never falls back to the Outskill key.
export function resolveKey(req: Request): ResolvedKey {
  const header = req.headers.get("x-openrouter-key");
  if (header !== null) {
    const key = header.trim();
    if (!key) throw new AppError(401, "Enter your OpenRouter key, or switch back to the Outskill key.", "no_key");
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
      ? "Your OpenRouter key was rejected (401). Check it with Test key, or switch to the Outskill key."
      : "The Outskill key was rejected (401). Choose Bring your own key to continue.", "invalid_key");
  }
  if (status === 402) {
    return new AppError(402, keySource === "user"
      ? "Your OpenRouter key is out of credits (402). Add credits or switch to the Outskill key."
      : "The Outskill key is out of credits. Choose Bring your own key to continue.", "no_credits");
  }
  if (status === 429) return new AppError(429, "OpenRouter is rate limiting requests (429). Wait a few seconds, then click Retry.", "rate_limited");
  if (status === 413) return new AppError(413, "The screenshots are too large to send (413). Use smaller images.", "too_large");
  const badModel = detail.match(/(\S+) is not a valid model id/i);
  if (badModel) {
    return new AppError(400, `"${badModel[1].slice(0, 80)}" isn't a valid OpenRouter model ID. Start a new review and pick a preset under Advanced, or clear the Custom model ID field.`, "invalid_model");
  }
  if (status === 404 || /image|vision|modalit|tool|support/.test(d)) {
    return new AppError(400, "This model can't read images or use web search. Pick a preset under Advanced, such as google/gemini-3.8-flash.", "model_unsupported");
  }
  if (status === 408 || status === 504) return new AppError(504, "The model took too long to answer. Click Retry.", "timeout");
  return new AppError(status >= 400 ? status : 502, `OpenRouter returned an error (${status}). Click Retry.`, "upstream");
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
