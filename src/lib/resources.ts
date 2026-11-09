import { PII_MESSAGE, hasPII } from "@/lib/pii";

// FR-04: study resources per case. Kinds and messages are the prototype's.
export const RESOURCE_KINDS = ["Judgment", "Article", "Lecture", "Book", "Video", "Note"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export type ResourceInput = { title: string; kind: string; url: string };

/** Same checks as the prototype's Add button; the database re-checks length, kind and PII. */
export function checkResource({ title, kind, url }: ResourceInput): string | null {
  if (!title) return "Add a title — e.g. 'Federal Court judgment, 2026'.";
  if (title.length > 200) return "Keep the title to 200 characters.";
  if (!RESOURCE_KINDS.includes(kind as ResourceKind)) return "Pick a resource type.";
  if (url.length > 1000) return "Keep the link or citation to 1,000 characters.";
  if (url && !/^https?:/i.test(url) && /^www\./i.test(url)) return "Start links with https:// so they open.";
  if (hasPII(`${title} ${url}`)) return PII_MESSAGE;
  return null;
}

/** Only http(s) links become clickable; anything else (a citation, or javascript:) is shown as text. */
export const isLink = (url: string) => /^https?:\/\//i.test(url);

export type ResourceRow = {
  id: string;
  title: string;
  kind: string;
  url: string;
  shared: boolean;
  class_id: string | null;
  class_name: string | null;
  user_id: string;
};

/** Who may edit or remove a row. Mirrors the resources_update/delete RLS policies (the real check). */
export function canChangeResource(
  r: Pick<ResourceRow, "user_id" | "shared" | "class_id">,
  viewer: { id: string; role: string },
  taughtClassIds: string[],
): boolean {
  if (viewer.role === "peer") return false;
  if (viewer.role === "builder" || r.user_id === viewer.id) return true;
  return viewer.role === "lecturer" && r.shared && !!r.class_id && taughtClassIds.includes(r.class_id);
}

/** Where a resource is shared, as shown on its row. */
export function sharedLabel(r: Pick<ResourceRow, "shared" | "class_id" | "class_name">): string | null {
  if (!r.shared) return null;
  if (!r.class_id) return "Shared with everyone";
  return `Shared with ${r.class_name ?? "a class"}`;
}
