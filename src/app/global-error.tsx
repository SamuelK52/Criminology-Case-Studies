"use client";

// Last-resort error page (the root layout itself failed). It renders its own document,
// so it uses inline styles in the app's colours rather than globals.css.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#141312", color: "#f3efe6", font: "16px/1.6 Georgia, serif" }}>
        <title>Something went wrong · CaseLab Criminology</title>
        <main style={{ maxWidth: 560, margin: "15vh auto", padding: 24, background: "#f3efe6", color: "#1b1a18" }} role="alert">
          <h1 style={{ font: "400 32px/1 Impact, sans-serif", textTransform: "uppercase", margin: "0 0 12px" }}>Something went wrong</h1>
          <p>CaseLab couldn&apos;t load. Your data is safe. Try again in a moment.</p>
          <button type="button" onClick={() => retry()} style={{ background: "#0b0b0b", color: "#f3efe6", border: 0, padding: "9px 14px", font: "600 12px monospace", textTransform: "uppercase", cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
