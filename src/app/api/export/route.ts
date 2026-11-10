import { connection } from "next/server";
import { getViewer } from "@/lib/auth";
import { exportBackup } from "@/lib/backup";
import { can } from "@/lib/permissions";

// FR-12: download all of this user's own data as JSON. Students and the builder ("Backup/export").
export async function GET() {
  await connection();
  const v = await getViewer();
  if (!v) return Response.json({ error: "Sign in to export your data." }, { status: 401 });
  if (!can(v.role, "backup")) return Response.json({ error: "Export is for student accounts." }, { status: 403 });
  try {
    const data = await exportBackup(v.id);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="caselab-backup-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("export failed", e);
    return Response.json({ error: "Couldn't build the backup — try again." }, { status: 500 });
  }
}
