// Case folder tabs in the prototype's order and colours. Each tab is its own URL
// (/cases/07, /cases/07/resources, …) so it can be linked and reloaded.
export const TABS = [
  { name: "Summary", path: "", colour: "var(--signal)" },
  { name: "Resources", path: "/resources", colour: "var(--cobalt)" },
  { name: "Flashcards", path: "/flashcards", colour: "var(--emerald)" },
  { name: "Quiz", path: "/quiz", colour: "var(--lemon)" }, // light: dark text
  { name: "Arguments", path: "/arguments", colour: "var(--violet)" },
  { name: "Progress", path: "/progress", colour: "var(--black)" },
  { name: "Features", path: "/features", colour: "var(--cobalt)" },
] as const;
export type Tab = (typeof TABS)[number];

/** The tab for a path like /cases/07/quiz (Summary for /cases/07). */
export function tabFromPath(pathname: string): Tab {
  const rest = pathname.replace(/^\/cases\/[^/]+/, "").replace(/\/$/, "");
  return TABS.find((t) => t.path === rest) ?? TABS[0];
}
