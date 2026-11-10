import { FeatureIdeas } from "@/components/FeatureIdeas";
import { FEATURES } from "@/lib/ai/prompts";
import { CaseFrame, aiStateFor } from "../frame";

/** Features tab (FR-14): the prototype's roadmap, and AI feature ideas for roles with AI tools. */
export default function FeaturesPage({ params }: PageProps<"/cases/[code]/features">) {
  return (
    <CaseFrame params={params} tab="Features">
      {(_c, v) => {
        const ai = aiStateFor(v);
        return (
          <>
            <div className="card">
              <h2>Feature roadmap for this app</h2>
              <p className="sub">Built now: case bank, AI summaries, resource organiser, flashcards, quizzes, argument ladders. Next ideas, simplest first:</p>
            </div>
            <div className="feat">
              {FEATURES.map(([level, name, what]) => (
                <div className="card" key={name}>
                  <span className="chip">{level}</span>
                  <h3 style={{ marginTop: 6 }}>{name}</h3>
                  <p>{what}</p>
                </div>
              ))}
            </div>
            {ai === "on" && <FeatureIdeas />}
            {ai === "offline" && <p className="sub">AI is offline — feature suggestions need it. The roadmap above is built in.</p>}
          </>
        );
      }}
    </CaseFrame>
  );
}
