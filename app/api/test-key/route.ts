import { describeKey, keyFacts, messageForStatus, toSafeError } from "@/lib/keys";

export const runtime = "nodejs";

// Checks a BYOK key against OpenRouter and returns only valid, limit_remaining and a description of the key.
export async function POST(req: Request) {
  const key = req.headers.get("x-openrouter-key")?.trim();
  if (!key) return Response.json({ valid: false, error: "Enter your OpenRouter key first." }, { status: 400 });
  try {
    const res = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const err = messageForStatus(res.status, "user");
      return Response.json({ valid: false, error: err.message }, { status: res.status === 401 ? 401 : err.status });
    }
    const facts = await keyFacts(key);
    return Response.json({ valid: true, limit_remaining: facts?.remaining ?? null, about: facts ? describeKey(facts) : null });
  } catch (err) {
    return Response.json({ valid: false, error: toSafeError(err).message }, { status: 502 });
  }
}
