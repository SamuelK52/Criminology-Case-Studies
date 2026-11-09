"use client";

import { useState } from "react";
import { LADDER_ROUNDS, LADDER_SIDES } from "@/lib/ai/prompts";
import { PII_MESSAGE, hasPII } from "@/lib/pii";
import { useAiStream } from "./useAiStream";

const OFFLINE = "AI is offline, and argument ladders, mock-trial notes and the counter-check need it. The case file, flashcards and quiz still work.";

/** FR-08: the prototype's Arguments tab — ladder, mock-trial speaking notes, and a one-point counter-check. */
export function ArgumentsTool({ caseId, aiOn }: { caseId: string; aiOn: boolean }) {
  const ladder = useAiStream();
  const counter = useAiStream();
  const [side, setSide] = useState<string>(LADDER_SIDES[0]);
  const [rounds, setRounds] = useState<string>(LADDER_ROUNDS[0]);
  const [point, setPoint] = useState("");

  function check() {
    const p = point.trim();
    if (!p) return counter.setOut("Paste one point first, e.g. 'The confession proves guilt'.");
    if (hasPII(p)) return counter.setOut(PII_MESSAGE);
    void counter.run("/api/ai/arguments", { caseId, kind: "counter", point: p });
  }

  return (
    <>
      <div className="card">
        <div className="lbl">Argument ladder · prosecution / plaintiff vs defence</div>
        <div className="row">
          <label className="sr-only" htmlFor="side">Type of case</label>
          <select id="side" className="field" style={{ width: "auto" }} value={side} onChange={(e) => setSide(e.target.value)}>
            {LADDER_SIDES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="n">Number of rounds</label>
          <select id="n" className="field" style={{ width: "auto" }} value={rounds} onChange={(e) => setRounds(e.target.value)}>
            {LADDER_ROUNDS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button className="btn" type="button" disabled={!aiOn || ladder.busy} onClick={() => void ladder.run("/api/ai/arguments", { caseId, kind: "ladder", side, rounds })}>
            Build ladder
          </button>
          <button className="btn ghost" type="button" disabled={!aiOn || ladder.busy} onClick={() => void ladder.run("/api/ai/arguments", { caseId, kind: "moot" })}>
            Mock-trial speaking notes
          </button>
          {ladder.busy && (
            <button className="btn ghost" type="button" onClick={ladder.stop}>
              Stop
            </button>
          )}
        </div>
        <p className="sub">
          Each round shows the claim, the best counter-argument, and a direct rebuttal. Arguments not taken from the trial record are labelled &quot;likely
          argument&quot; — don&apos;t cite those as testimony.
        </p>
        <div className="out" aria-live="polite">
          {aiOn ? ladder.out : OFFLINE}
        </div>
      </div>

      <div className="card">
        <label className="lbl" htmlFor="pt" style={{ display: "block" }}>
          Counter-check one point
        </label>
        <input
          id="pt"
          className="field"
          placeholder="Paste one point, e.g. 'The confession proves guilt'"
          value={point}
          maxLength={500}
          onChange={(e) => setPoint(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && aiOn && !counter.busy) check();
          }}
        />
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn ghost" type="button" disabled={!aiOn || counter.busy} onClick={check}>
            Give me the strongest counter + rebuttal
          </button>
          {counter.busy && (
            <button className="btn ghost" type="button" onClick={counter.stop}>
              Stop
            </button>
          )}
        </div>
        {counter.out && (
          <div className="out" aria-live="polite" style={{ marginTop: 10 }}>
            {counter.out}
          </div>
        )}
      </div>
    </>
  );
}
