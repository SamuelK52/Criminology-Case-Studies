import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { aiConfigured } from "@/lib/ai/claude";
import { getViewer, type Viewer } from "@/lib/auth";
import { loadCase } from "@/lib/cases";
import { can } from "@/lib/permissions";
import type { CaseRow } from "@/lib/types";

// The header, drawer and folder tabs are in ./layout.tsx and stay on screen between tabs.
// Each tab page wraps its content in <CaseFrame> to get the case and the viewer.

/** AI tools for this viewer: on, offline (no key), or none (signed out / study group). */
export const aiStateFor = (v: Viewer | null): "on" | "offline" | "none" =>
  v && can(v.role, "ai") ? (aiConfigured() ? "on" : "offline") : "none";

type Params = Promise<{ code: string }>;
type Render = (c: CaseRow, v: Viewer | null) => ReactNode;

export function CaseFrame({ params, children }: { params: Params; children: Render }) {
  return (
    <Suspense fallback={<div className="card" style={{ minHeight: 240 }} aria-busy="true" />}>
      <CaseContent params={params}>{children}</CaseContent>
    </Suspense>
  );
}

async function CaseContent({ params, children }: { params: Params; children: Render }) {
  const { code } = await params;
  const v = await getViewer();
  const { c } = await loadCase(code, v?.id ?? null); // cached for this request; the layout already loaded it
  if (!c) notFound();
  return <>{children(c, v)}</>;
}
