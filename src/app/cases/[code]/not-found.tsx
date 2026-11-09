import Link from "next/link";

export default function CaseNotFound() {
  return (
    <div className="card" role="alert">
      <div className="lbl">No such case file</div>
      <p>That case doesn&apos;t exist, or it belongs to someone else.</p>
      <p>
        <Link href="/cases/01">Back to the case bank</Link>
      </p>
    </div>
  );
}
