import Link from "next/link";

/** Any unknown address (case pages have their own "No such case file"). */
export default function NotFound() {
  return (
    <div className="wrap">
      <div className="card" role="alert" style={{ maxWidth: 640, margin: "40px auto" }}>
        <div className="lbl">404 · Not in the archive</div>
        <h2>There&apos;s no page here</h2>
        <p>The link may be mistyped, or the page has moved.</p>
        <p>
          <Link href="/cases/01">Back to the case bank</Link>
        </p>
      </div>
    </div>
  );
}
