// FR-11: progress per case and per theme, weakest first — the prototype's mastery(), quizStats()
// and Progress() maths, fed from Postgres instead of localStorage.

/** One row per visible case: card counts (with this user's progress) and quiz totals. */
export type CaseProgressRow = {
  code: string;
  name: string;
  focus: string[];
  cards: number; // n
  seen: number;
  known: number; // box 3+
  due: number; // unseen or due now
  runs: number; // quizzes taken
  score: number; // sum of scores
  total: number; // sum of totals
};

export type CaseProgress = CaseProgressRow & { cardPct: number; quizPct: number | null; touched: boolean; overall: number };

/** Mastery % from cards, averaged with the quiz % when there is one (the prototype's rule). */
export function caseProgress(r: CaseProgressRow): CaseProgress {
  const cardPct = r.cards ? Math.round((r.known / r.cards) * 100) : 0;
  const quizPct = r.total ? Math.round((r.score / r.total) * 100) : null;
  return {
    ...r,
    cardPct,
    quizPct,
    touched: r.seen > 0 || r.runs > 0,
    overall: quizPct == null ? cardPct : Math.round((cardPct + quizPct) / 2),
  };
}

/** "Racism, police" → "Racism"; themes are the case's focus items with the first letter capitalised. */
const themeName = (t: string) => {
  const s = t.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export type ThemeScore = { theme: string; pct: number; cases: number };

/** Themes the user has studied, weakest first. A theme's score is the mean of its studied cases. */
export function weakestThemes(rows: CaseProgress[]): ThemeScore[] {
  const themes = new Map<string, CaseProgress[]>();
  for (const r of rows) {
    const names = r.focus.length ? r.focus : ["Unsorted"];
    for (const t of names) {
      const k = themeName(t);
      if (!k) continue;
      themes.set(k, [...(themes.get(k) ?? []), r]);
    }
  }
  const out: ThemeScore[] = [];
  for (const [theme, rs] of themes) {
    const studied = rs.filter((r) => r.touched);
    if (!studied.length) continue;
    out.push({ theme, pct: Math.round(studied.reduce((a, r) => a + r.overall, 0) / studied.length), cases: studied.length });
  }
  return out.sort((a, b) => a.pct - b.pct || a.theme.localeCompare(b.theme));
}

/** Headline chips: cases studied, cards due, quiz average. */
export function totals(rows: CaseProgress[]) {
  const score = rows.reduce((a, r) => a + r.score, 0);
  const total = rows.reduce((a, r) => a + r.total, 0);
  return {
    studied: rows.filter((r) => r.touched).length,
    cases: rows.length,
    due: rows.reduce((a, r) => a + r.due, 0),
    runs: rows.reduce((a, r) => a + r.runs, 0),
    quizPct: total ? Math.round((score / total) * 100) : null,
  };
}

/** Bar colour by score, as in the prototype: green 70+, amber 40+, red below. */
export const barColour = (p: number) => (p >= 70 ? "var(--accent)" : p >= 40 ? "var(--warn)" : "var(--bad)");
