"use client";

import { useState } from "react";
import { PII_MESSAGE, hasPII } from "@/lib/pii";
import { useAiStream } from "./useAiStream";

/** FR-14: "Ask for more ideas" on the Features tab. */
export function FeatureIdeas() {
  const { out, setOut, busy, run, stop } = useAiStream();
  const [q, setQ] = useState("");
  function go() {
    if (hasPII(q)) return setOut(PII_MESSAGE);
    void run("/api/ai/features", { forWhom: q.trim() });
  }
  return (
    <div className="card">
      <label className="lbl" htmlFor="fq" style={{ display: "block" }}>
        Ask for more ideas
      </label>
      <input id="fq" className="field" placeholder="e.g. features for group revision before finals" value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !busy && go()} />
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn" type="button" onClick={go} disabled={busy}>
          {busy ? "Suggesting…" : "Suggest features"}
        </button>
        {busy && (
          <button className="btn ghost" type="button" onClick={stop}>
            Stop
          </button>
        )}
      </div>
      {out && (
        <div className="out" aria-live="polite" style={{ marginTop: 10 }}>
          {out}
        </div>
      )}
    </div>
  );
}
