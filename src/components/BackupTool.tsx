"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Summary = { cases: number; notes: number; resources: number; aiCards: number; progress: number; quizzes: number; skipped: number };

function describe(s: Summary): string {
  const parts = [
    [s.notes, "note"],
    [s.resources, "resource"],
    [s.progress, "card progress record"],
    [s.quizzes, "quiz score"],
    [s.aiCards, "AI card"],
    [s.cases, "own case"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`);
  const main = parts.length ? `Restored ${parts.join(", ")}.` : "Nothing to restore — everything in the backup is already here.";
  return s.skipped ? `${main} ${s.skipped} item${s.skipped === 1 ? "" : "s"} skipped (case no longer available).` : main;
}

/** FR-12: download a JSON backup, and restore one from a file or pasted text (merges, never deletes). */
export function BackupTool() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, start] = useTransition();

  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > 2_000_000) return setMsg({ text: "That file is too large (over 2 MB).", bad: true });
    setText(await file.text());
    setMsg({ text: `Loaded ${file.name}. Press Restore to import it.` });
  }

  function restore() {
    if (!text.trim()) return setMsg({ text: "Choose a backup file or paste the backup text first.", bad: true });
    setMsg(null);
    start(async () => {
      try {
        const res = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
        const j = (await res.json().catch(() => ({}))) as { summary?: Summary; error?: string };
        if (!res.ok || !j.summary) return setMsg({ text: j.error ?? "Couldn't import that backup — nothing was changed.", bad: true });
        setMsg({ text: describe(j.summary) });
        setText("");
        router.refresh();
      } catch {
        setMsg({ text: "Couldn't reach the server — check your connection and try again.", bad: true });
      }
    });
  }

  return (
    <div className="card">
      <div className="lbl">Backup (data safety)</div>
      <p className="sub">
        Download all your notes, resources, flashcard progress, AI cards, quiz scores and own cases as a JSON file. Restoring merges it back: anything
        missing returns, newer work is kept, nothing is deleted.
      </p>
      <div className="row">
        <a className="btn ghost" href="/api/export" download>
          Download backup
        </a>
        <label className="btn ghost" style={{ cursor: "pointer" }}>
          Choose backup file…
          <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        <button className="btn" type="button" onClick={restore} disabled={busy}>
          {busy ? "Restoring…" : "Restore"}
        </button>
      </div>
      <label className="sr-only" htmlFor="bkT">Backup text</label>
      <textarea
        id="bkT"
        className="field"
        placeholder="Or paste the backup text here to restore it"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ marginTop: 8, minHeight: 90 }}
      />
      <div className={msg?.bad ? "err" : "ok-msg"} role="status" style={{ minHeight: 18, marginTop: 4 }}>
        {msg?.text}
      </div>
    </div>
  );
}
