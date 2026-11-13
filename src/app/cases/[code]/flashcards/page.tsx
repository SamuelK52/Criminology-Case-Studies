import { Suspense } from "react";
import { Flashcards } from "@/components/Flashcards";
import type { Viewer } from "@/lib/auth";
import { loadCards } from "@/lib/cases";
import { can } from "@/lib/permissions";
import type { CaseRow } from "@/lib/types";
import { CaseFrame, aiStateFor } from "../frame";

/** Flashcards tab (FR-06). Everyone can flip cards; signed-in users keep their spaced-repetition progress. */
export default function FlashcardsPage({ params }: PageProps<"/cases/[code]/flashcards">) {
  return (
    <CaseFrame params={params}>
      {(c, v) => (
        <Suspense fallback={<div className="card flash" aria-busy="true" />}>
          <Deck c={c} v={v} />
        </Suspense>
      )}
    </CaseFrame>
  );
}

async function Deck({ c, v }: { c: CaseRow; v: Viewer | null }) {
  const cards = await loadCards(c.id, v?.id ?? null);
  return (
    <Flashcards
      key={c.id}
      caseId={c.id}
      initialCards={cards}
      signedIn={!!v}
      canReset={!!v && can(v.role, "edit")}
      aiState={v && can(v.role, "edit") ? aiStateFor(v) : "none"}
    />
  );
}
