"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Any page that fails to render (e.g. the database stops answering mid-request). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";
  return (
    <div className="wrap">
      <div className="card" role="alert" style={{ maxWidth: 640, margin: "40px auto" }}>
        <div className="lbl">Something went wrong</div>
        <h2>This file wouldn&apos;t open</h2>
        <p>The server hit a problem loading this page. Your notes and progress are safe — nothing was lost. Try again in a moment.</p>
        <div className="row">
          <button className="btn" type="button" onClick={() => retry()}>
            Try again
          </button>
          <Link className="btn ghost" href="/cases/01">
            Back to the case bank
          </Link>
        </div>
        {digest && <p className="sub">Reference: {digest}</p>}
      </div>
    </div>
  );
}
