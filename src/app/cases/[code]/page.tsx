import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { CaseDrawer } from "@/components/CaseDrawer";
import { Dossier, Outcomes } from "@/components/Dossier";
import { SummaryTool } from "@/components/SummaryTool";
import { aiConfigured } from "@/lib/ai/claude";
import { getViewer, type Viewer } from "@/lib/auth";
import { loadCase, loadCases, loadNote } from "@/lib/cases";
import { PERMISSION_LABELS, ROLES, can, type Permission } from "@/lib/permissions";
import type { CaseRow } from "@/lib/types";

// Folder tabs (prototype order). Only Summary exists so far; the rest arrive in Milestones 4–7.
const TABS = [{ name: "Summary", colour: "var(--signal)" }] as const;

export default function CasePage({ params }: PageProps<"/cases/[code]">) {
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
        <br />
        <Suspense fallback={<span className="note">AI: checking…</span>}>
          <AiState />
        </Suspense>
      </AppHeader>

      <Suspense fallback={<ArchiveSkeleton />}>
        <CaseView params={params} />
      </Suspense>
    </div>
  );
}

async function CaseCount() {
  const v = await getViewer();
  const { cases } = await loadCases(v?.id ?? null);
  return `${cases.length} case dossier${cases.length === 1 ? "" : "s"}`;
}

/** As in the prototype's header: "AI: ready" / "offline — built-in study mode" / "not available for your role". */
async function AiState() {
  const v = await getViewer();
  const text = v && !can(v.role, "ai") ? "AI: not available for your role" : aiConfigured() ? "AI: ready" : "AI: offline — built-in study mode";
  return <span className="note">{text}</span>;
}

async function CaseView({ params }: { params: PageProps<"/cases/[code]">["params"] }) {
  const { code } = await params;
  const v = await getViewer();
  const { c, all } = await loadCase(code, v?.id ?? null);
  if (all.error) {
    return (
      <div className="card" role="alert">
        <div className="lbl">Setup needed</div>
        <p>{all.error}</p>
      </div>
    );
  }
  if (!c) notFound();

  // Only plain, needed fields cross to the client component.
  const drawer = all.cases.map(({ id, code, name, focus, jurisdiction, owner_id, class_id }) => ({ id, code, name, focus, jurisdiction, owner_id, class_id }));
  const tab = TABS[0];

  return (
    <div className="layout">
      <CaseDrawer cases={drawer} current={c.code} canAdd={can(v?.role, "add")} signedIn={!!v} />

      <main>
        <div className="tabs" role="tablist" aria-label="Case sections">
          {TABS.map((t) => (
            <Link
              key={t.name}
              href={`/cases/${c.code}`}
              role="tab"
              className="tab"
              style={{ "--t": t.colour } as React.CSSProperties}
              aria-selected={t === tab}
            >
              {t.name}
            </Link>
          ))}
        </div>
        <div className="folder" style={{ "--folder": tab.colour } as React.CSSProperties}>
          <div className="folder-cap">
            <span>
              File {c.code} / {tab.name}
            </span>
            <span>{c.focus[0] ?? "Criminology"}</span>
          </div>
          <div className="pane">
            <Dossier c={c} />
            <Outcomes c={c} />
            <Suspense fallback={<div className="card" style={{ minHeight: 200 }} aria-busy="true" />}>
              <Tools c={c} v={v} />
            </Suspense>
            {v && <Access v={v} />}
          </div>
        </div>
      </main>
    </div>
  );
}

async function Tools({ c, v }: { c: CaseRow; v: Viewer | null }) {
  if (!v) {
    return (
      <p className="sub">
        <Link href="/login" style={{ color: "inherit" }}>
          Sign in
        </Link>{" "}
        to keep notes on this case and summarise them with AI.
      </p>
    );
  }
  // FR-09: study group sees the case file only; the notes and AI tools are hidden.
  if (!can(v.role, "edit") && !can(v.role, "ai")) return null;
  const notes = await loadNote(c.id, v.id);
  return (
    <SummaryTool key={c.id} caseId={c.id} initialNotes={notes} canEdit={can(v.role, "edit")} canAI={can(v.role, "ai")} aiReady={aiConfigured()} />
  );
}

const SHOWN: Permission[] = ["view", "add", "edit", "del", "ai", "backup", "manageClasses", "manageUsers"];

/** What this role can do (FR-09). */
function Access({ v }: { v: Viewer }) {
  const r = ROLES[v.role];
  return (
    <details className="card">
      <summary className="lbl" style={{ cursor: "pointer", margin: 0 }}>
        Your access · {r.name}
      </summary>
      <ul className="access" style={{ marginTop: 10 }}>
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
    </details>
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
