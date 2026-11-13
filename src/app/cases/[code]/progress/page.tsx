import Link from "next/link";
import { Suspense } from "react";
import { BackupTool } from "@/components/BackupTool";
import type { Viewer } from "@/lib/auth";
import { loadProgress } from "@/lib/cases";
import { can } from "@/lib/permissions";
import { barColour, caseProgress, totals, weakestThemes } from "@/lib/progress";
import { CaseFrame } from "../frame";

/** Progress tab (FR-11, FR-12): every case you can see, weakest themes first, and your backup. */
export default function ProgressPage({ params }: PageProps<"/cases/[code]/progress">) {
  return (
    <CaseFrame params={params}>
      {(_c, v) =>
        v ? (
          <Suspense fallback={<div className="card" style={{ minHeight: 240 }} aria-busy="true" />}>
            <ProgressView v={v} />
          </Suspense>
        ) : (
          <p className="sub">
            <Link href="/login" style={{ color: "inherit" }}>
              Sign in
            </Link>{" "}
            to track which cases and themes you know, and which to revise next.
          </p>
        )
      }
    </CaseFrame>
  );
}

const Bar = ({ p }: { p: number }) => (
  <div className="bar" role="img" aria-label={`${p}%`}>
    <span style={{ width: `${p}%`, background: barColour(p) }} />
  </div>
);

async function ProgressView({ v }: { v: Viewer }) {
  const rows = (await loadProgress(v.id)).map(caseProgress);
  const weak = weakestThemes(rows);
  const t = totals(rows);
  return (
    <>
      <div className="card">
        <h2>Your progress</h2>
        <div className="meta">
          <span className="chip">
            {t.studied} / {t.cases} cases studied
          </span>
          <span className="chip">{t.due} cards due</span>
          <span className="chip">
            Quiz average {t.quizPct == null ? "—" : `${t.quizPct}%`} over {t.runs} quiz{t.runs === 1 ? "" : "zes"}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="lbl">Weakest themes first</div>
        {weak.length ? (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Theme</th>
                  <th scope="col">Score</th>
                  <th scope="col">
                    <span className="sr-only">Bar</span>
                  </th>
                  <th scope="col">Cases</th>
                </tr>
              </thead>
              <tbody>
                {weak.map((w) => (
                  <tr key={w.theme}>
                    <td>{w.theme}</td>
                    <td className="num">{w.pct}%</td>
                    <td>
                      <Bar p={w.pct} />
                    </td>
                    <td className="num">{w.cases}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sub">Review some flashcards or finish a quiz and your weak themes appear here.</p>
        )}
      </div>

      <div className="card">
        <div className="lbl">By case</div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Case</th>
                <th scope="col">Cards known</th>
                <th scope="col">Due</th>
                <th scope="col">Quiz</th>
                <th scope="col">
                  <span className="sr-only">Bar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td>
                    <Link href={`/cases/${r.code}/flashcards`} style={{ color: "inherit" }}>
                      {r.name}
                    </Link>
                  </td>
                  <td className="num">
                    {r.known}/{r.cards}
                  </td>
                  <td className="num">{r.due}</td>
                  <td className="num">{r.quizPct == null ? "—" : `${r.quizPct}%`}</td>
                  <td>
                    <Bar p={r.overall} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {can(v.role, "backup") && <BackupTool />}
    </>
  );
}
