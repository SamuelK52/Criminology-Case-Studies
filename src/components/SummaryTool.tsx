"use client";

import { useRef, useState } from "react";
import { saveNotes } from "@/app/cases/actions";
import { SUMMARY_MODES } from "@/lib/ai/prompts";
import { PII_MESSAGE, hasPII } from "@/lib/pii";
import { useAiStream } from "./useAiStream";

type Props = {
  caseId: string;
  initialNotes: string;
  canEdit: boolean; // notes autosave
  canAI: boolean;
  aiReady: boolean;
};

const SAVE_DELAY = 800;

/** "Summarise your notes or a reading": autosaved notes (FR-05) and a streamed AI summary (FR-03). */
export function SummaryTool({ caseId, initialNotes, canEdit, canAI, aiReady }: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [save, setSave] = useState<{ text: string; bad?: boolean }>({ text: "" });
  const [mode, setMode] = useState<string>(SUMMARY_MODES[0]);
  const { out, setOut, busy, run, stop } = useAiStream();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initialNotes);

  function onNotes(value: string) {
    setNotes(value);
    if (!canEdit) return;
    if (timer.current) clearTimeout(timer.current);
    if (hasPII(value)) {
      setSave({ text: `${PII_MESSAGE} (Notes not saved.)`, bad: true });
      return;
    }
    setSave({ text: "Saving…" });
    timer.current = setTimeout(async () => {
      if (value === lastSaved.current) return setSave({ text: "Saved" });
      const r = await saveNotes(caseId, value);
      if (r.status === "saved") {
        lastSaved.current = value;
        setSave({ text: `Saved ${new Date(r.at ?? Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` });
      } else setSave({ text: r.message ?? "Couldn't save.", bad: true });
    }, SAVE_DELAY);
  }

  function summarise() {
    if (hasPII(notes)) {
      setOut(PII_MESSAGE);
      return;
    }
    void run("/api/ai/summary", { caseId, notes, mode });
  }

  return (
    <div className="card">
      <label className="lbl" htmlFor="notes" style={{ display: "block" }}>
        Summarise your notes or a reading
      </label>
      <textarea
        id="notes"
        className="field"
        placeholder="Paste lecture notes, a judgment extract or an article…"
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
        maxLength={50000}
        aria-describedby="notes-status"
      />
      <div id="notes-status" className={save.bad ? "err" : "sub"} role="status" style={{ minHeight: 18, marginTop: 4 }}>
        {canEdit ? save.text : "Sign in as a student to keep notes — these aren't saved."}
      </div>
      {canAI && (
        <>
          <div className="row" style={{ marginTop: 8 }}>
            <label className="sr-only" htmlFor="mode">Summary type</label>
            <select id="mode" className="field" style={{ width: "auto" }} value={mode} onChange={(e) => setMode(e.target.value)}>
              {SUMMARY_MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <button className="btn" type="button" onClick={summarise} disabled={busy || !aiReady}>
              {busy ? "Summarising…" : "Summarise"}
            </button>
            {busy && (
              <button className="btn ghost" type="button" onClick={stop}>
                Stop
              </button>
            )}
          </div>
          {!aiReady && <p className="sub">AI is offline — the case file above still works.</p>}
          <div className="out" aria-live="polite" style={{ marginTop: 12 }}>
            {out}
          </div>
        </>
      )}
    </div>
  );
}
