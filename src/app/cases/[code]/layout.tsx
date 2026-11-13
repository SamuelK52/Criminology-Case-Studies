import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { CaseDrawer } from "@/components/CaseDrawer";
import { CaseFolder } from "@/components/CaseFolder";
import { aiConfigured } from "@/lib/ai/claude";
import { getViewer, type Viewer } from "@/lib/auth";
import { loadCase, loadCases } from "@/lib/cases";
import { PERMISSION_LABELS, ROLES, can, type Permission } from "@/lib/permissions";

// Shared by every case tab: header, case drawer, folder tabs and folder body. Because this is a
// layout, it stays mounted when you switch tabs — only the tab's content (the page) re-renders,
// so the screen doesn't jump back to the top.
export default function CaseLayout({ params, children }: LayoutProps<"/cases/[code]">) {
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
        <CaseShell params={params}>{children}</CaseShell>
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

async function CaseShell({ params, children }: { params: Promise<{ code: string }>; children: React.ReactNode }) {
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
  return (
    <div className="layout">
      <CaseDrawer cases={drawer} current={c.code} canAdd={can(v?.role, "add")} signedIn={!!v} />
      <CaseFolder code={c.code} theme={c.focus[0] ?? "Criminology"}>
        {children}
        {v && <Access v={v} />}
      </CaseFolder>
    </div>
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
