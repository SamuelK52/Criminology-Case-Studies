"use client";

import { OFFLINE_SOURCES } from "@/lib/ai/prompts";
import { useAiStream } from "./useAiStream";

/** "Suggested source starting points": AI suggestions when available, the prototype's built-in text otherwise. */
export function SourceSuggest({ caseId, aiOn }: { caseId: string; aiOn: boolean }) {
  const { out, busy, run, stop } = useAiStream();
  return (
    <div className="card">
      <div className="lbl">Suggested source starting points</div>
      <div className="out" aria-live="polite">
        {aiOn ? out || "Ask the AI which courts, reports and archives to search — it names types of source and search terms, not invented citations." : OFFLINE_SOURCES}
      </div>
      {aiOn && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => void run("/api/ai/sources", { caseId })}>
            {busy ? "Suggesting…" : "Suggest what to look up"}
          </button>
          {busy && (
            <button className="btn ghost" type="button" onClick={stop}>
              Stop
            </button>
          )}
        </div>
      )}
    </div>
  );
}
