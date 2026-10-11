import { runAgent, type AgentBody } from "@/lib/agents";
import { AppError, describeKey, diagnose, keyFacts, redact, resolveKey, spendableNow, toSafeError, type ResolvedKey } from "@/lib/keys";
import type { StepId } from "@/lib/steps";

export const runtime = "nodejs";
export const maxDuration = 120;

const AGENTS: StepId[] = ["search", "visual", "ux", "a11y", "market", "compare", "lead"];
const MAX_BODY = 4 * 1024 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ agent: string }> }) {
  const { agent } = await ctx.params;
  let resolved: ResolvedKey | undefined;
  try {
    if (!AGENTS.includes(agent as StepId)) throw new AppError(404, "Unknown step.", "unknown_step");
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) throw new AppError(413, "The screenshots are too large to send (413). Use smaller images.", "too_large");
    resolved = resolveKey(req);
    const body = (await req.json()) as AgentBody;
    if (!body?.model || typeof body.model !== "string") throw new AppError(400, "No model selected.", "no_model");
    const output = await runAgent(agent as StepId, body, resolved);
    return Response.json({ output, keySource: resolved.keySource });
  } catch (err) {
    const safe = toSafeError(err, resolved);
    // For credit errors, say which key failed and what its own limit is (last 3 characters only).
    if ((safe.code === "key_limit" || safe.code === "no_credits") && resolved) {
      const [facts, spend] = await Promise.all([keyFacts(resolved.apiKey), spendableNow(resolved.apiKey)]);
      const verdict = diagnose(facts, spend);
      safe.message = [safe.message, facts && describeKey(facts), verdict && `Diagnosis: ${verdict}`].filter(Boolean).join(" ");
    }
    // Log only sanitized text: never the key or the request body.
    console.error(`[agents/${agent}] ${safe.code} (${safe.status}): ${redact(String((err as Error)?.message ?? err), resolved?.apiKey).slice(0, 300)}`);
    return Response.json({ error: safe.message, code: safe.code, keySource: resolved?.keySource }, { status: safe.status });
  }
}
