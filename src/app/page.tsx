import { Suspense } from "react";
import { Dossier, Outcomes } from "@/components/Dossier";
import { Wordmark } from "@/components/Wordmark";
import { loadCases } from "@/lib/cases";
import { caseColour, isLightColour } from "@/lib/types";

// Milestone 1: prove the case bank loads from Postgres. Routing, auth and tabs arrive in later milestones.
// The shell prerenders; anything that reads the session/database streams in behind <Suspense>.
export default function Home() {
  return (
    <div className="wrap">
      <header className="app-header">
        <div>
          <Wordmark />
          <h1 className="headline">
            Criminal
            <br />
            Case Files
          </h1>
          <div className="sub">
            CaseLab Criminology — a student&apos;s archive of real cases: summaries, sources, flashcards, quizzes and
            both sides of the argument.
          </div>
        </div>
        <div className="meta-col">
          Malaysia · UK · US · Italy
          <br />
          <Suspense fallback="Opening the drawer…">
            <CaseCount />
          </Suspense>
        </div>
      </header>

      <Suspense fallback={<ArchiveSkeleton />}>
        <Archive />
      </Suspense>
    </div>
  );
}

async function CaseCount() {
  const { cases } = await loadCases();
  return `${cases.length} case dossier${cases.length === 1 ? "" : "s"}`;
}

async function Archive() {
  const { cases, error } = await loadCases();
  const cur = cases[0];
  return (
    <div className="layout">
      <aside className="side" aria-label="Case bank">
        <div className="lbl">Case bank</div>
        <nav className="cases">
          {cases.map((c) => {
            const col = caseColour(c);
            return (
              <button
                key={c.id}
                className="case"
                style={{ "--c": col } as React.CSSProperties}
                data-light={isLightColour(col) || undefined}
                aria-current={c === cur}
              >
                <span>{c.code}</span>
                {c.name}
              </button>
            );
          })}
          {!cases.length && !error && <p className="sub">The case bank is empty — run the seed (see README).</p>}
        </nav>
      </aside>

      <main>
        <div className="folder" style={{ "--folder": "var(--signal)" } as React.CSSProperties}>
          <div className="folder-cap">
            <span>{cur ? `File ${cur.code} / Summary` : "Archive"}</span>
            <span>{cur?.focus[0] ?? "Criminology"}</span>
          </div>
          <div className="pane">
            {error && (
              <div className="card" role="alert">
                <div className="lbl">Setup needed</div>
                <p>{error}</p>
              </div>
            )}
            {cur && <Dossier c={cur} />}
            {cur && <Outcomes c={cur} />}
          </div>
        </div>
      </main>
    </div>
  );
}

function ArchiveSkeleton() {
  return (
    <div className="layout" aria-busy="true">
      <aside className="side">
        <div className="lbl">Case bank</div>
        <p className="sub">Loading cases…</p>
      </aside>
      <main>
        <div className="folder" style={{ minHeight: 320 }} />
      </main>
    </div>
  );
}
