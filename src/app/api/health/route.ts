import { connection } from "next/server";
import { dbConfigured, withUser } from "@/lib/db";

// Railway health check (.railway/railway.ts). 200 when the app can query Postgres as caselab_app;
// 503 otherwise, so a release that can't reach the database never receives traffic.
export async function GET() {
  await connection(); // always at request time, never prerendered
  if (!dbConfigured()) return Response.json({ ok: false, db: "not configured" }, { status: 503 });
  try {
    await withUser(null, (tx) => tx`select 1 from cases limit 1`);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, db: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
