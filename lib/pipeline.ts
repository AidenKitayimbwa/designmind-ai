// Browser only. Runs the 7 steps: step 1, then steps 2–6 together, then step 7.
// Every status change and result is saved to IndexedDB, so a reload resumes where it left off.
import { measureAll } from "./contrast";
import { retrieveForSteps } from "./retrieval";
import { getKeySettings, keyHeaders, loadReview, updateReview } from "./review-store";
import type { A11yModelOutput, Review, StepId, StepOutputs } from "./steps";

const PARALLEL: StepId[] = ["visual", "ux", "a11y", "market", "compare"];
const MAX_BODY = 4 * 1024 * 1024;
const running = new Set<string>(); // guards against double runs (React strict mode, double clicks)

type Listener = (r: Review) => void;

class StepError extends Error {}

async function callAgent(review: Review, step: StepId, body: object): Promise<{ output: unknown; keySource: "outskill" | "user" }> {
  if (review.keyMode === "byok" && !getKeySettings().key) {
    throw new StepError("This review uses your own key, but it isn't in this tab. Start a new review and enter your key again, or choose the Outskill key.");
  }
  const json = JSON.stringify({ model: review.model, ...body });
  if (json.length > MAX_BODY) throw new StepError("The screenshots are too large to send (over 4 MB). Use smaller images.");
  let res: Response;
  try {
    res = await fetch(`/api/agents/${step}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...keyHeaders(review.keyMode) },
      body: json,
      signal: AbortSignal.timeout(130_000),
    });
  } catch (err) {
    const name = (err as Error)?.name;
    throw new StepError(name === "TimeoutError" ? "The step timed out. Click Retry." : "Network error: couldn't reach the server. Check your connection and click Retry.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    if (data?.error) throw new StepError(data.error);
    if (res.status === 413) throw new StepError("The screenshots are too large to send (413). Use smaller images.");
    if (res.status === 504) throw new StepError("The step took too long and the server stopped it. Click Retry.");
    throw new StepError(`The server returned an error (${res.status}). Click Retry.`);
  }
  return data;
}

function bodyFor(step: StepId, r: Review): object {
  const images = r.images.map((i) => ({ id: i.id, src: i.src }));
  const search = r.outputs.search ?? null;
  switch (step) {
    case "search": return { images, context: r.context };
    case "visual": return { images, context: r.context, search, chunks: r.retrieved.visual ?? [] };
    case "ux": return { images, context: r.context, search, chunks: r.retrieved.ux ?? [] };
    case "a11y": return { images, chunks: r.retrieved.a11y ?? [] };
    case "market": return { context: r.context, search: search && { ...search, screens: [] } };
    case "compare": return { images, context: r.context, search };
    case "lead": {
      const o = r.outputs;
      const missing = (Object.keys(r.steps) as StepId[]).filter((s) => s !== "lead" && r.steps[s].status !== "done");
      // Send only what the lead reviewer needs: findings, scores and the pixel measurements.
      const outputs = {
        search: o.search && { productCategory: o.search.productCategory, likelyAudience: o.search.likelyAudience, summary: o.search.summary, similarApps: o.search.similarApps },
        visual: o.visual,
        ux: o.ux,
        accessibility: o.a11y && { issues: o.a11y.issues, measurements: o.a11y.measurements },
        market: o.market && { ...o.market, trace: undefined },
        compare: o.compare,
      };
      return { outputs, missing, screenRefs: r.images.map((i) => i.id) };
    }
  }
}

async function runStep(id: string, step: StepId, emit: Listener): Promise<void> {
  emit(await updateReview(id, (r) => { r.steps[step] = { status: "running", startedAt: Date.now() }; }));
  try {
    const review = (await loadReview(id))!;
    const { output, keySource } = await callAgent(review, step, bodyFor(step, review));
    let result = output;
    if (step === "a11y") {
      // Contrast and target sizes come from the pixels, never from the model.
      const model = output as A11yModelOutput;
      const measured = await measureAll(model.elements, review.images);
      result = { ...model, measurements: measured.measurements, issues: [...measured.issues, ...model.issues] };
    }
    emit(await updateReview(id, (r) => {
      (r.outputs as Record<string, unknown>)[step] = result as StepOutputs[typeof step];
      r.steps[step] = { ...r.steps[step], status: "done", finishedAt: Date.now(), keySource };
    }));
  } catch (err) {
    const message = err instanceof StepError ? err.message : "Something went wrong in this step. Click Retry.";
    emit(await updateReview(id, (r) => { r.steps[step] = { ...r.steps[step], status: "failed", finishedAt: Date.now(), error: message }; }));
    throw err;
  }
}

export async function runReview(id: string, emit: Listener): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  try {
    let r = await loadReview(id);
    if (!r) return;

    // A reload mid-step leaves "running" behind: run those again.
    r = await updateReview(id, (x) => {
      for (const s of Object.values(x.steps)) if (s.status === "running") s.status = "waiting";
    });
    emit(r);

    if (r.steps.search.status === "waiting") await runStep(id, "search", emit).catch(() => undefined);

    // Retrieval runs in the browser once step 1 is done (or failed: then only the knowledge base is used).
    r = await updateReview(id, (x) => { x.retrieved = retrieveForSteps(x.outputs.search, x.context); });
    emit(r);

    await Promise.allSettled(PARALLEL.filter((s) => r!.steps[s].status === "waiting").map((s) => runStep(id, s, emit)));

    r = (await loadReview(id))!;
    if (r.steps.lead.status === "waiting") await runStep(id, "lead", emit).catch(() => undefined);
  } finally {
    running.delete(id);
  }
}

// Retry one failed step. When it succeeds, the lead reviewer runs again so the results include it.
export async function retryStep(id: string, step: StepId, emit: Listener): Promise<void> {
  emit(await updateReview(id, (r) => {
    r.steps[step] = { status: "waiting" };
    if (step !== "lead" && r.steps.lead.status !== "running") r.steps.lead = { status: "waiting" };
  }));
  // If the other steps are still running, retry this one on its own; the running review picks up step 7.
  if (running.has(id)) await runStep(id, step, emit).catch(() => undefined);
  else await runReview(id, emit);
}
