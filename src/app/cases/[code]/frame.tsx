import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { CaseDrawer } from "@/components/CaseDrawer";
import { aiConfigured } from "@/lib/ai/claude";
import { getViewer, type Viewer } from "@/lib/auth";
import { loadCase, loadCases } from "@/lib/cases";
import { PERMISSION_LABELS, ROLES, can, type Permission } from "@/lib/permissions";
import { isLightColour, type CaseRow } from "@/lib/types";

// Shared frame for every case tab: header, case drawer, folder tabs and the coloured folder body.
// Each tab is its own URL (/cases/07, /cases/07/resources, …) so it can be linked and reloaded.

/** Folder tabs in the prototype's order and colours. */
export const TABS = [
  { name: "Summary", path: "", colour: "var(--signal)" },
  { name: "Resources", path: "/resources", colour: "var(--cobalt)" },
  { name: "Flashcards", path: "/flashcards", colour: "var(--emerald)" },
  { name: "Quiz", path: "/quiz", colour: "var(--lemon)" }, // light: dark text
  { name: "Arguments", path: "/arguments", colour: "var(--violet)" },
  { name: "Progress", path: "/progress", colour: "var(--black)" },
  { name: "Features", path: "/features", colour: "var(--cobalt)" },
] as const;
export type TabName = (typeof TABS)[number]["name"];

/** AI tools for this viewer: on, offline (no key), or none (signed out / study group). */
export const aiStateFor = (v: Viewer | null): "on" | "offline" | "none" =>
  v && can(v.role, "ai") ? (aiConfigured() ? "on" : "offline") : "none";

type Params = Promise<{ code: string }>;

export function CaseFrame({ params, tab, children }: { params: Params; tab: TabName; children: (c: CaseRow, v: Viewer | null) => ReactNode }) {
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
        <CaseView params={params} tab={tab}>
          {children}
        </CaseView>
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

async function CaseView({ params, tab: tabName, children }: { params: Params; tab: TabName; children: (c: CaseRow, v: Viewer | null) => ReactNode }) {
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
  const tab = TABS.find((t) => t.name === tabName) ?? TABS[0];

  return (
    <div className="layout">
      <CaseDrawer cases={drawer} current={c.code} canAdd={can(v?.role, "add")} signedIn={!!v} tabPath={tab.path} />

      <main>
        <nav className="tabs" aria-label="Case sections">
          {TABS.map((t) => (
            <Link
              key={t.name}
              href={`/cases/${c.code}${t.path}`}
              className="tab"
              style={{ "--t": t.colour } as React.CSSProperties}
              aria-current={t === tab ? "page" : undefined}
              data-light={isLightColour(t.colour) || undefined}
            >
              {t.name}
            </Link>
          ))}
        </nav>
        <div className="folder" style={{ "--folder": tab.colour } as React.CSSProperties} data-light={isLightColour(tab.colour) || undefined}>
          <div className="folder-cap">
            <span>
              File {c.code} / {tab.name}
            </span>
            <span>{c.focus[0] ?? "Criminology"}</span>
          </div>
          <div className="pane">
            {children(c, v)}
            {v && <Access v={v} />}
          </div>
        </div>
      </main>
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
