"use client";

import { useActionState, useState, useTransition } from "react";
import { removeResource, saveResource, type ResourceState } from "@/app/cases/[code]/resources/actions";
import { RESOURCE_KINDS, isLink, sharedLabel, type ResourceRow } from "@/lib/resources";

export type ResourceItem = ResourceRow & { canChange: boolean };

type Props = {
  caseId: string;
  items: ResourceItem[];
  canAdd: boolean; // study group: list only
  shareOptions: { value: string; label: string }[]; // lecturer/builder; empty = "just me" only
};

const EMPTY = { title: "", kind: "Judgment", url: "", share: "" };

/** FR-04: add, edit and remove study resources for one case (the prototype's Resources tab). */
export function ResourcesTool({ caseId, items, canAdd, shareOptions }: Props) {
  const [state, formAction, saving] = useActionState<ResourceState, FormData>(saveResource, { error: null, saved: 0 });
  // Edit mode lasts until the next successful save (state.saved moves on) or Cancel.
  const [editing, setEditing] = useState<{ id: string; at: number } | null>(null);
  const editRow = editing && editing.at === state.saved ? items.find((r) => r.id === editing.id) : undefined;
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  const [removing, startRemove] = useTransition();
  // A save error stays until the next submit, unless the user moves on (Edit / Cancel).
  const [dismissed, setDismissed] = useState<ResourceState | null>(null);
  const error = state !== dismissed ? state.error : null;

  // After a failed save, show what was typed; otherwise the row being edited, or a blank form.
  const values = error && state.values
    ? state.values
    : editRow
      ? { title: editRow.title, kind: editRow.kind, url: editRow.url, share: editRow.shared ? (editRow.class_id ?? "all") : "" }
      : EMPTY;

  function edit(r: ResourceItem) {
    setRemoveErr(null);
    setDismissed(state);
    setEditing({ id: r.id, at: state.saved });
    requestAnimationFrame(() => document.getElementById("rT")?.focus());
  }

  function remove(r: ResourceItem) {
    setRemoveErr(null);
    startRemove(async () => {
      const res = await removeResource(r.id);
      if (res.error) setRemoveErr(res.error);
      else if (editing?.id === r.id) setEditing(null);
    });
  }

  return (
    <>
      {canAdd && (
        <form className="card" action={formAction} key={`${editRow?.id ?? "new"}-${state.saved}`}>
          <div className="lbl">{editRow ? "Edit resource" : "Add a study resource"}</div>
          <input type="hidden" name="caseId" value={caseId} />
          {editRow && <input type="hidden" name="id" value={editRow.id} />}
          <div className="row">
            <label className="sr-only" htmlFor="rT">Title</label>
            <input id="rT" name="title" className="field" placeholder="Title" defaultValue={values.title} maxLength={200} style={{ flex: 2, minWidth: 160 }} aria-describedby="rErr" />
            <label className="sr-only" htmlFor="rK">Type</label>
            <select id="rK" name="kind" className="field" defaultValue={values.kind} style={{ flex: 1, minWidth: 120 }}>
              {RESOURCE_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <label className="sr-only" htmlFor="rU">Link or citation</label>
            <input id="rU" name="url" className="field" placeholder="Link or citation" defaultValue={values.url} maxLength={1000} style={{ flex: 1, minWidth: 200 }} aria-describedby="rErr" />
            {shareOptions.length > 0 && (
              <>
                <label className="sr-only" htmlFor="rS">Who can see it</label>
                <select id="rS" name="share" className="field" defaultValue={values.share} style={{ width: "auto" }}>
                  <option value="">Just me</option>
                  {shareOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </>
            )}
            <button className="btn" disabled={saving}>
              {saving ? "Saving…" : editRow ? "Save changes" : "Add"}
            </button>
            {editRow && (
              <button className="btn ghost" type="button" onClick={() => { setDismissed(state); setEditing(null); }}>
                Cancel
              </button>
            )}
          </div>
          <div className="err" id="rErr" role="alert">
            {error}
          </div>
        </form>
      )}

      <div className="card">
        <div className="lbl">
          {items.length} resource{items.length === 1 ? "" : "s"} for this case
        </div>
        {removeErr && (
          <div className="err" role="alert">
            {removeErr}
          </div>
        )}
        {items.length === 0 && (
          <p className="sub">
            No resources yet. Start with the court judgment — for Malaysian cases, Federal Court / Court of Appeal judgments; UK: Court of Appeal decisions and inquiry reports; US: published opinions.
          </p>
        )}
        {items.map((r) => {
          const shared = sharedLabel(r);
          return (
            <div className="res" key={r.id} data-editing={r.id === editRow?.id || undefined}>
              <div>
                <span className="chip">{r.kind}</span> {r.title}
                {shared && <span className="chip check" style={{ marginLeft: 6 }}>{shared}</span>}
                <br />
                {r.url &&
                  (isLink(r.url) ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      {r.url}
                    </a>
                  ) : (
                    <span className="sub">{r.url}</span>
                  ))}
              </div>
              {r.canChange && (
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <button className="btn ghost" type="button" onClick={() => edit(r)} aria-label={`Edit ${r.title}`}>
                    Edit
                  </button>
                  <button className="btn ghost" type="button" onClick={() => remove(r)} disabled={removing} aria-label={`Remove ${r.title}`}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
