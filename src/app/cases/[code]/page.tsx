import Link from "next/link";
import { Suspense } from "react";
import { Dossier, Outcomes } from "@/components/Dossier";
import { SummaryTool } from "@/components/SummaryTool";
import { aiConfigured } from "@/lib/ai/claude";
import type { Viewer } from "@/lib/auth";
import { loadNote } from "@/lib/cases";
import { can } from "@/lib/permissions";
import type { CaseRow } from "@/lib/types";
import { CaseFrame } from "./frame";

/** Summary tab: the case file (original verdict and latest outcome kept apart), notes and the AI summary. */
export default function CasePage({ params }: PageProps<"/cases/[code]">) {
  return (
    <CaseFrame params={params} tab="Summary">
      {(c, v) => (
        <>
          <Dossier c={c} />
          <Outcomes c={c} />
          <Suspense fallback={<div className="card" style={{ minHeight: 200 }} aria-busy="true" />}>
            <Tools c={c} v={v} />
          </Suspense>
        </>
      )}
    </CaseFrame>
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
