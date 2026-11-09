"use client";

import { useEffect, useRef, useState } from "react";

/** POST to an /api/ai/* route and show the streamed answer as it arrives. Shared by every AI tool. */
export function useAiStream() {
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // Stop a running request if the user leaves the page.
  useEffect(() => () => abort.current?.abort(), []);

  async function run(url: string, body: unknown) {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setBusy(true);
    setOut("Thinking…");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const e = (await res.json().catch(() => ({}))) as { error?: string; retryAt?: string | null };
        const when = e.retryAt ? ` Try again at ${new Date(e.retryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.` : "";
        setOut(`${e.error ?? "Couldn't generate — try again in a moment."}${when}`);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let text = "";
      for (let r = await reader.read(); !r.done; r = await reader.read()) {
        text += r.value;
        setOut(text);
      }
      if (!text) setOut("The AI returned nothing — try again.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setOut("Couldn't reach the server — check your connection and try again.");
    } finally {
      if (abort.current === ac) {
        abort.current = null;
        setBusy(false);
      }
    }
  }

  return { out, setOut, busy, run, stop: () => abort.current?.abort() };
}
