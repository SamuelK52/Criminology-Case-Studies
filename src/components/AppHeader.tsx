import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/login/actions";
import { Wordmark } from "@/components/Wordmark";
import { getViewer } from "@/lib/auth";
import { ROLES, can } from "@/lib/permissions";

type Page = "home" | "classes" | "admin";

/** Header with the wordmark and headline (static), plus the signed-in user's chip and links (streamed). */
export function AppHeader({ page, title, children }: { page: Page; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="app-header">
      <div>
        <Wordmark />
        <h1 className="headline">{title}</h1>
        <div className="sub">
          CaseLab Criminology — a student&apos;s archive of real cases: summaries, sources, flashcards, quizzes and both
          sides of the argument.
        </div>
      </div>
      <div className="meta-col">
        {children}
        <Suspense fallback={<div className="who" aria-busy="true" />}>
          <Who page={page} />
        </Suspense>
      </div>
    </header>
  );
}

async function Who({ page }: { page: Page }) {
  const v = await getViewer();
  if (!v) {
    return (
      <nav className="nav" aria-label="Account">
        <Link href="/login">Sign in</Link>
        <Link href="/login?mode=signup">Create account</Link>
      </nav>
    );
  }
  const r = ROLES[v.role];
  const cur = (p: Page) => (p === page ? ("page" as const) : undefined);
  return (
    <>
      <div className="who">
        <span className="chip">
          {v.name} · {r.name}
          {v.classCode ? ` · ${v.classCode}` : ""}
        </span>
        {v.requestedRole === "lecturer" && <span className="chip pending">Lecturer request pending</span>}
        <form action={signOut}>
          <button className="btn small" type="submit">
            Sign out
          </button>
        </form>
      </div>
      <nav className="nav" aria-label="Main">
        <Link href="/" aria-current={cur("home")}>Case files</Link>
        <Link href="/classes" aria-current={cur("classes")}>
          {can(v.role, "manageClasses") ? "My classes" : "My class"}
        </Link>
        {can(v.role, "manageUsers") && (
          <Link href="/admin" aria-current={cur("admin")}>
            Admin
          </Link>
        )}
      </nav>
    </>
  );
}
