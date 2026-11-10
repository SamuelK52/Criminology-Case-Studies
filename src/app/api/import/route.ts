import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { MAX_BACKUP_BYTES, importBackup, parseBackup } from "@/lib/backup";
import { friendlyDbError } from "@/lib/dberror";
import { can } from "@/lib/permissions";

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// FR-12: import a backup made by /api/export. Merges, never deletes; one transaction (all or nothing).
export async function POST(req: Request) {
  // Same-site requests only (the session cookie is SameSite=Lax; this is a second check).
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin && origin !== `https://${req.headers.get("host")}`) {
    return json(403, { error: "Bad request." });
  }
  const v = await getViewer();
  if (!v) return json(401, { error: "Sign in to import your data." });
  if (!can(v.role, "backup")) return json(403, { error: "Import is for student accounts." });

  const text = await req.text();
  if (text.length > MAX_BACKUP_BYTES) return json(413, { error: "That backup is too large (over 2 MB)." });
  const backup = parseBackup(text);
  if (typeof backup === "string") return json(400, { error: backup });
  try {
    const summary = await importBackup(v.id, backup);
    revalidatePath("/cases", "layout");
    return json(200, { summary });
  } catch (e) {
    console.error("import failed", e);
    return json(400, { error: friendlyDbError(e, "Couldn't import that backup — nothing was changed.") });
  }
}
