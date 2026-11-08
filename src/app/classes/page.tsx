import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { requireViewer, type Viewer } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { ROLES, can } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { deleteClass, leaveClass } from "./actions";
import { ConfirmButton, CreateClassForm, JoinClassForm } from "./forms";

export const metadata: Metadata = { title: "Classes · CaseLab Criminology" };

export default function ClassesPage() {
  return (
    <div className="wrap">
      <AppHeader page="classes" title="Classes" />
      <div className="folder" style={{ "--folder": "var(--cobalt)" } as React.CSSProperties}>
        <div className="folder-cap">
          <span>Archive / Classes</span>
          <span>Join codes</span>
        </div>
        <Suspense fallback={<div className="pane" aria-busy="true"><p className="sub">Loading classes…</p></div>}>
          <Classes />
        </Suspense>
      </div>
    </div>
  );
}

type ClassRow = { id: string; name: string; join_code: string; lecturer_id: string; members: number };
type Member = { class_id: string; display_name: string; role: Role };

async function Classes() {
  const v = await requireViewer();
  const manage = can(v.role, "manageClasses");
  const { classes, members } = manage
    ? await withUser(v.id, async (tx) => {
        // RLS: lecturers see classes they teach; the builder sees every class.
        const classes = await tx<ClassRow[]>`
          select c.id, c.name, c.join_code, c.lecturer_id,
                 (select count(*)::int from profiles p where p.class_id = c.id) as members
          from classes c
          where c.lecturer_id = ${v.id} or ${v.role === "builder"}
          order by c.created_at desc`;
        const members = await tx<Member[]>`
          select class_id, display_name, role::text as role from profiles
          where class_id = any(${classes.map((c) => c.id)}::uuid[])
          order by display_name`;
        return { classes: [...classes], members: [...members] };
      })
    : { classes: [] as ClassRow[], members: [] as Member[] };

  return (
    <div className="pane">
      <MyClass v={v} />

      {manage && (
        <div className="card">
          <div className="lbl">Create a class</div>
          <p className="sub" style={{ marginTop: 0 }}>
            Give students the join code. They enter it at sign-up or on this page.
          </p>
          <CreateClassForm />
        </div>
      )}

      {manage && (
        <div className="card">
          <div className="lbl">{v.role === "builder" ? "All classes" : "Classes you teach"}</div>
          {!classes.length && <p>No classes yet.</p>}
          {classes.map((c) => (
            <div key={c.id} className="res">
              <div style={{ flex: 1, minWidth: 220 }}>
                <b>{c.name}</b> · <code>{c.join_code}</code> · {c.members} member{c.members === 1 ? "" : "s"}
                <div className="sub">
                  {members
                    .filter((m) => m.class_id === c.id)
                    .map((m) => `${m.display_name} (${ROLES[m.role].name})`)
                    .join(", ") || "Nobody has joined yet."}
                </div>
              </div>
              <form action={deleteClass}>
                <input type="hidden" name="id" value={c.id} />
                <ConfirmButton message={`Delete "${c.name}"? Members keep their accounts but leave the class. This can't be undone.`}>
                  Delete class
                </ConfirmButton>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MyClass({ v }: { v: Viewer }) {
  return (
    <div className="card">
      <div className="lbl">Your class</div>
      {v.classId ? (
        <div className="row">
          <p style={{ margin: 0, flex: 1 }}>
            <b>{v.className}</b> · <code>{v.classCode}</code>
          </p>
          <form action={leaveClass}>
            <button className="btn ghost" type="submit">Leave class</button>
          </form>
        </div>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>You&apos;re not in a class. Enter the code from your lecturer to see your class&apos;s cases and resources.</p>
          <JoinClassForm />
        </>
      )}
    </div>
  );
}
