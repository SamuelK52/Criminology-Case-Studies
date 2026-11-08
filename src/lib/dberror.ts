// Turn a Postgres error into a message that is safe to show. Our own functions raise friendly
// messages with known SQLSTATE codes; anything else gets a generic message (and is logged).
const FRIENDLY = new Set(["22023", "23505", "P0002", "P0001", "42501"]);

export function friendlyDbError(e: unknown, fallback = "Something went wrong — try again in a moment."): string {
  const err = e as { code?: string; message?: string; constraint_name?: string };
  if (err?.code === "23514") return "That value isn't allowed — check for IC or bank numbers and length limits.";
  if (err?.code === "23505" && err.constraint_name === "classes_join_code_key") return "Another class already uses that join code.";
  if (err?.code && FRIENDLY.has(err.code) && err.message) return err.message;
  console.error(e);
  return fallback;
}
