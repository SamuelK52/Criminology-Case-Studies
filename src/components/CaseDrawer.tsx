"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { addCase, type AddCaseState } from "@/app/cases/actions";
import { matchesCase } from "@/lib/search";
import { tabFromPath } from "@/lib/tabs";
import { caseColour, isLightColour, type CaseRow } from "@/lib/types";

type DrawerCase = Pick<CaseRow, "id" | "code" | "name" | "focus" | "jurisdiction" | "owner_id" | "class_id">;

/** Case bank: index-card drawer with search (FR-02) and "Add your own case" for roles that can add. */
export function CaseDrawer({ cases, current, canAdd, signedIn }: { cases: DrawerCase[]; current: string | null; canAdd: boolean; signedIn: boolean }) {
  const tabPath = tabFromPath(usePathname()).path; // switching case keeps the same tab
  const [q, setQ] = useState("");
  const list = useMemo(() => cases.filter((c) => matchesCase(c, q)), [cases, q]);
  const [state, action, pending] = useActionState<AddCaseState, FormData>(addCase, { error: null });

  return (
    <aside className="side" aria-label="Case bank">
      <label className="lbl" htmlFor="find" style={{ display: "block" }}>Case bank</label>
      <input
        id="find"
        className="field"
        type="search"
        placeholder="Search cases or themes"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <nav className="cases" aria-label="Cases">
        {list.map((c) => {
          const col = caseColour(c);
          return (
            <Link
              key={c.id}
              href={`/cases/${c.code}${tabPath}`}
              className="case"
              style={{ "--c": col } as React.CSSProperties}
              data-light={isLightColour(col) || undefined}
              aria-current={c.code === current ? "page" : undefined}
            >
              <span>{c.code}</span>
              {c.name}
            </Link>
          );
        })}
        {!list.length && <p className="sub">No case matches “{q}”.</p>}
      </nav>
      <p className="sub" role="status" style={{ margin: "6px 0 0" }}>
        {q ? `${list.length} of ${cases.length} cases` : ""}
      </p>

      {canAdd && (
        <form action={action} noValidate style={{ marginTop: 14 }}>
          <label className="lbl" htmlFor="newCase" style={{ display: "block" }}>Add your own case</label>
          <input id="newCase" name="name" className="field" placeholder="e.g. Lindy Chamberlain" maxLength={120} defaultValue={state.name} />
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn ghost" type="submit" disabled={pending}>{pending ? "Adding…" : "Add case"}</button>
          </div>
          <div className="err" role="alert">{state.error ?? ""}</div>
        </form>
      )}
      {!signedIn && (
        <p className="sub" style={{ marginTop: 14 }}>
          <Link href="/login" style={{ color: "inherit" }}>Sign in</Link> to add your own cases.
        </p>
      )}
    </aside>
  );
}
