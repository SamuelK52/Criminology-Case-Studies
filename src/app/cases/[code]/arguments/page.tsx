import Link from "next/link";
import { ArgumentsTool } from "@/components/ArgumentsTool";
import { Dossier } from "@/components/Dossier";
import { CaseFrame, aiStateFor } from "../frame";

/** Arguments tab (FR-08): AI argument ladder, mock-trial notes and counter-check. */
export default function ArgumentsPage({ params }: PageProps<"/cases/[code]/arguments">) {
  return (
    <CaseFrame params={params}>
      {(c, v) => {
        const ai = aiStateFor(v);
        return (
          <>
            <Dossier c={c} />
            {!v ? (
              <p className="sub">
                <Link href="/login" style={{ color: "inherit" }}>
                  Sign in
                </Link>{" "}
                to build prosecution vs defence argument ladders for this case.
              </p>
            ) : ai === "none" ? (
              // FR-09: study group has no AI tools.
              <p className="sub">Argument ladders use AI, which is for students, lecturers and the builder. The case file, flashcards and quiz are open to you.</p>
            ) : (
              <ArgumentsTool key={c.id} caseId={c.id} aiOn={ai === "on"} />
            )}
          </>
        );
      }}
    </CaseFrame>
  );
}
