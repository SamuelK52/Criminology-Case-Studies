import Link from "next/link";
import { Suspense } from "react";
import { Dossier } from "@/components/Dossier";
import { ResourcesTool } from "@/components/ResourcesTool";
import { SourceSuggest } from "@/components/SourceSuggest";
import { aiConfigured } from "@/lib/ai/claude";
import type { Viewer } from "@/lib/auth";
import { loadResources, loadTaughtClasses } from "@/lib/cases";
import { can } from "@/lib/permissions";
import { canChangeResource } from "@/lib/resources";
import type { CaseRow } from "@/lib/types";
import { CaseFrame } from "../frame";

/** Resources tab (FR-04): the student's sources for this case, class resources, and AI source suggestions. */
export default function ResourcesPage({ params }: PageProps<"/cases/[code]/resources">) {
  return (
    <CaseFrame params={params}>
      {(c, v) => (
        <>
          <Dossier c={c} />
          <Suspense fallback={<div className="card" style={{ minHeight: 160 }} aria-busy="true" />}>
            <Resources c={c} v={v} />
          </Suspense>
          <SourceSuggest key={c.id} caseId={c.id} aiOn={!!v && can(v.role, "ai") && aiConfigured()} />
        </>
      )}
    </CaseFrame>
  );
}

async function Resources({ c, v }: { c: CaseRow; v: Viewer | null }) {
  if (!v) {
    return (
      <p className="sub">
        <Link href="/login" style={{ color: "inherit" }}>
          Sign in
        </Link>{" "}
        to keep your own list of judgments, articles and lectures for this case — on any device.
      </p>
    );
  }
  const [rows, classes] = await Promise.all([loadResources(c.id, v.id), loadTaughtClasses(v.id, v.role)]);
  const taught = classes.map((k) => k.id);
  const items = rows.map((r) => ({ ...r, canChange: canChangeResource(r, v, taught) }));
  const shareOptions = [
    ...classes.map((k) => ({ value: k.id, label: `Share with ${k.name}` })),
    ...(v.role === "builder" ? [{ value: "all", label: "Share with everyone" }] : []),
  ];
  // FR-09: study group sees resources shared with them, with every control hidden.
  return <ResourcesTool key={c.id} caseId={c.id} items={items} canAdd={can(v.role, "edit")} shareOptions={shareOptions} />;
}
