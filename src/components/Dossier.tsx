import type { CaseRow } from "@/lib/types";

/** Case dossier header: paper clip, "File 07 · US" label, big headline, sticky-note theme chips. */
export function Dossier({ c }: { c: CaseRow }) {
  return (
    <div className="card dossier">
      <span className="clip" aria-hidden="true" />
      <div className="lbl">
        File {c.code} · {c.jurisdiction || "Your own case"}
      </div>
      <h2>{c.name}</h2>
      <div className="meta">
        {c.jurisdiction && <span className="chip">{c.jurisdiction}</span>}
        {c.focus.map((f) => (
          <span className="chip" key={f}>
            {f}
          </span>
        ))}
        {c.needs_verify && <span className="chip check">verify latest outcome</span>}
      </div>
    </div>
  );
}

/** Original verdict and latest outcome are always shown separately (accuracy NFR). */
export function Outcomes({ c }: { c: CaseRow }) {
  return (
    <div className="card">
      <div className="lbl">Case overview</div>
      <p className="drop">{c.overview || "Your own case — paste notes below and generate a summary."}</p>
      <div className="lbl">Original verdict</div>
      <p>{c.original_verdict || "Not recorded — check the first-instance judgment."}</p>
      <div className="lbl">Latest legal outcome</div>
      <p>{c.latest_outcome || "—"}</p>
    </div>
  );
}
