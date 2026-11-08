import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Dossier, Outcomes } from "@/components/Dossier";
import { getViewer, type Viewer } from "@/lib/auth";
import { loadCases } from "@/lib/cases";
import { PERMISSION_LABELS, ROLES, type Permission } from "@/lib/permissions";
import { caseColour, isLightColour } from "@/lib/types";

// The shell prerenders; anything that reads the session/database streams in behind <Suspense>.
// Case tabs (Summary, Resources, Flashcards…) arrive in Milestones 3–7.
export default function Home() {
  return (
    <div className="wrap">
      <AppHeader
        page="home"
        title={
          <>
            Criminal
            <br />
            Case Files
          </>
        }
      >
        Malaysia · UK · US · Italy
        <br />
        <Suspense fallback="Opening the drawer…">
          <CaseCount />
        </Suspense>
      </AppHeader>

      <Suspense fallback={<ArchiveSkeleton />}>
        <Archive />
      </Suspense>
    </div>
  );
}

async function CaseCount() {
  const v = await getViewer();
  const { cases } = await loadCases(v?.id ?? null);
  return `${cases.length} case dossier${cases.length === 1 ? "" : "s"}`;
}

async function Archive() {
  const v = await getViewer();
  const { cases, error } = await loadCases(v?.id ?? null);
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
            {!error && <Access v={v} />}
            {cur && <Dossier c={cur} />}
            {cur && <Outcomes c={cur} />}
          </div>
        </div>
      </main>
    </div>
  );
}

const SHOWN: Permission[] = ["view", "add", "edit", "del", "ai", "backup", "manageClasses", "manageUsers"];

/** What this role can do (FR-09). The tools themselves appear, or stay hidden, as later milestones add them. */
function Access({ v }: { v: Viewer | null }) {
  if (!v) {
    return (
      <p className="sub">
        You&apos;re browsing the shared case bank.{" "}
        <Link href="/login" style={{ color: "inherit" }}>
          Sign in
        </Link>{" "}
        to keep notes, flashcard progress and quiz scores.
      </p>
    );
  }
  const r = ROLES[v.role];
  return (
    <div className="card">
      <div className="lbl">Your access · {r.name}</div>
      <ul className="access">
        {SHOWN.map((p) => (
          <li key={p} data-no={!r.perm[p] || undefined}>
            {PERMISSION_LABELS[p]}
            {!r.perm[p] && <span className="sr-only"> (not available for your role)</span>}
          </li>
        ))}
      </ul>
      {v.requestedRole === "lecturer" && (
        <p className="sub" style={{ marginBottom: 0 }}>
          Your lecturer request is waiting for the builder. Until then you have student access.
        </p>
      )}
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
