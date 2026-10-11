"use client";

import { useState } from "react";
import type { KeyMode } from "@/lib/review-store";
import { isValidModelId, MODEL_PRESETS } from "@/lib/steps";

type Props = {
  mode: KeyMode;
  onModeChange: (m: KeyMode) => void;
  apiKey: string;
  onKeyChange: (k: string) => void;
  model: string;
  onModelChange: (m: string) => void;
  customModel: string;
  onCustomModelChange: (m: string) => void;
};

type TestResult = { valid: boolean; label?: string | null; limit_remaining?: number | null; error?: string };

export default function KeyOptions(p: Props) {
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  async function testKey() {
    setTesting(true);
    setTest(null);
    try {
      const res = await fetch("/api/test-key", { method: "POST", headers: { "x-openrouter-key": p.apiKey } });
      setTest(await res.json());
    } catch {
      setTest({ valid: false, error: "Couldn't reach the server. Check your connection." });
    } finally {
      setTesting(false);
    }
  }

  const customInvalid = p.customModel !== "" && !isValidModelId(p.customModel);
  const radio = "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-ink has-[:checked]:bg-paper";

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 font-bold">API key</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={`${radio} border-line`}>
          <input type="radio" name="key-mode" value="outskill" checked={p.mode === "outskill"} onChange={() => p.onModeChange("outskill")} className="mt-1 size-4 accent-ink" />
          <span><span className="font-bold">Outskill key</span><span className="block text-sm text-muted">Default. No setup needed.</span></span>
        </label>
        <label className={`${radio} border-line`}>
          <input type="radio" name="key-mode" value="byok" checked={p.mode === "byok"} onChange={() => p.onModeChange("byok")} className="mt-1 size-4 accent-ink" />
          <span><span className="font-bold">Bring your own key (BYOK)</span><span className="block text-sm text-muted">Use your own OpenRouter credits.</span></span>
        </label>
      </div>

      {p.mode === "byok" && (
        <div className="rounded-lg border border-line bg-paper p-3">
          <label htmlFor="byok-key" className="font-bold">OpenRouter API key</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <div className="flex min-w-0 flex-1">
              <input
                id="byok-key"
                type={show ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                value={p.apiKey}
                onChange={(e) => { p.onKeyChange(e.target.value.trim()); setTest(null); }}
                placeholder="Paste your OpenRouter key"
                className="min-h-11 w-full min-w-0 rounded-l-md border border-line bg-surface px-3 font-mono text-sm"
              />
              <button type="button" onClick={() => setShow(!show)} aria-pressed={show} className="min-h-11 rounded-r-md border border-l-0 border-line bg-surface px-3 text-sm font-semibold">
                {show ? "Hide" : "Show"}
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={testKey} disabled={!p.apiKey || testing} className="min-h-11 flex-1 rounded-md border border-ink px-4 font-semibold disabled:opacity-50 sm:flex-none">
                {testing ? "Testing…" : "Test key"}
              </button>
              <button type="button" onClick={() => { p.onKeyChange(""); setTest(null); }} disabled={!p.apiKey} className="min-h-11 flex-1 rounded-md border border-line px-4 font-semibold disabled:opacity-50 sm:flex-none">
                Clear key
              </button>
            </div>
          </div>
          <p role="status" className="mt-2 text-sm">
            {test?.valid && <span className="text-pass">Key works{test.label && !/^sk-\w+-/.test(test.label) ? ` (${test.label})` : ""}. {test.limit_remaining != null ? `Credit remaining: $${Number(test.limit_remaining).toFixed(2)}.` : "No credit limit set."}</span>}
            {test && !test.valid && <span className="text-fail">{test.error ?? "This key didn't work."}</span>}
          </p>
        </div>
      )}

      <p className="text-sm text-muted">
        DesignMind AI uses the Outskill key by default. Choose Bring your own key to use your own OpenRouter credits; your key stays in this browser tab.
      </p>

      <details className="rounded-lg border border-line p-3">
        <summary className="min-h-8 cursor-pointer font-semibold">Advanced</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold">Model</span>
            <select value={p.model} onChange={(e) => p.onModelChange(e.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-2 text-sm">
              {MODEL_PRESETS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold">Custom model ID</span>
            <input
              value={p.customModel}
              onChange={(e) => p.onCustomModelChange(e.target.value.trim())}
              placeholder="Overrides the dropdown, e.g. vendor/model"
              aria-invalid={customInvalid}
              aria-describedby="custom-model-help"
              className={`mt-1 min-h-11 w-full rounded-md border bg-surface px-3 text-sm ${customInvalid ? "border-fail" : "border-line"}`}
            />
            <span id="custom-model-help" className={`mt-1 block text-sm ${customInvalid ? "text-fail" : "text-muted"}`}>
              {customInvalid
                ? "Use a full OpenRouter model ID such as anthropic/claude-haiku-5.5, or clear this field to use the dropdown."
                : "Leave empty to use the model picked in the dropdown."}
            </span>
          </label>
        </div>
      </details>
    </fieldset>
  );
}
