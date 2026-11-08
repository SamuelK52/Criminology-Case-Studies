import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Wordmark } from "@/components/Wordmark";
import { getViewer } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Open the Case Files · CaseLab Criminology" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="login">
      <div className="login-in">
        <div>
          <Wordmark />
          <h1 className="headline">
            Open the
            <br />
            Case Files
          </h1>
          <p className="sub">
            Sign in with your role. Each role sees different drawers: students study and edit their own notes,
            lecturers curate cases, study-group members review, the builder maintains the app.
          </p>
          <p className="sub">
            Use made-up names — never your IC number. Lecturer accounts start as students until the builder approves
            them.
          </p>
        </div>
        <Suspense fallback={<div className="card" style={{ minHeight: 320 }} aria-busy="true" />}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  if (await getViewer()) redirect("/");
  const { mode } = await searchParams;
  return <LoginForm startMode={mode === "signup" ? "signup" : "signin"} />;
}
