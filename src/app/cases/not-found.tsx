import Link from "next/link";

/** /cases/<code> for a case that doesn't exist or isn't yours (thrown by the case layout). */
export default function CaseNotFound() {
  return (
    <div className="wrap">
      <div className="card" role="alert" style={{ maxWidth: 640, margin: "40px auto" }}>
        <div className="lbl">No such case file</div>
        <p>That case doesn&apos;t exist, or it belongs to someone else.</p>
        <p>
          <Link href="/cases/01">Back to the case bank</Link>
        </p>
      </div>
    </div>
  );
}
