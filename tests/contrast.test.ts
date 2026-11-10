import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// NFR Accessibility: "readable contrast on every coloured background (white text on dark folders,
// dark text on lemon)". WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text (≥24px, or ≥18.7px bold)
// and for focus outlines. Colours are read from globals.css so the test follows the stylesheet.

const css = readFileSync("src/app/globals.css", "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`no --${name}`);
  return m[1];
};
type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const c = (name: string) => hex(token(name));
const WHITE: RGB = [255, 255, 255];
/** `top` at `alpha` over `under`. */
const over = (top: RGB, alpha: number, under: RGB): RGB => top.map((v, i) => Math.round(v * alpha + under[i] * (1 - alpha))) as RGB;
const lum = (rgb: RGB) => {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const desk = c("desk"), ink = c("ink"), paper = c("paper"), paper2 = c("paper-2"), mute = c("mute");
const field: RGB = hex("#fffdf7");
/** A hex colour set directly in a rule, e.g. rule(".err") → the .err text colour. */
const rule = (sel: string) => {
  const start = css.indexOf(`  ${sel} {`);
  if (start < 0) throw new Error(`no rule ${sel}`);
  const body = css.slice(start, css.indexOf("}", start));
  return hex(body.match(/[^-]color: (#[0-9a-fA-F]{6})/)![1]);
};

const DARK_FOLDERS = ["signal", "cobalt", "emerald", "violet", "black"] as const;

describe("text contrast (4.5:1)", () => {
  const pairs: [string, RGB, RGB][] = [
    ["body text on the desk", paper, desk],
    ["ink on paper sheets", ink, paper],
    ["muted labels (.sub, .lbl) on paper", mute, paper],
    ["muted labels on the case drawer", mute, paper2],
    ["header captions on the desk", hex("#a29a8c"), desk],
    ["error text on paper", rule(".err"), paper],
    ["ok message on paper", c("emerald"), paper],
    ["links on paper", c("cobalt"), paper],
    ["links in resource rows", c("cobalt"), field],
    ["AI-state note (lemon) on the desk", c("lemon"), desk],
    ["wordmark .my on the desk", hex("#00dcb4"), desk],
    ["black stamp buttons", paper, c("black")],
    ["verify chip: lemon on black", c("lemon"), c("black")],
    ...(["butter", "mint", "pink", "lav", "lemon"] as const).map((t): [string, RGB, RGB] => [`ink on ${t} chips/notes`, ink, c(t)]),
    ["ink on the Quiz (lemon) folder", ink, c("lemon")],
    ["ink on a lemon selected case card", ink, c("lemon")],
    ...DARK_FOLDERS.map((f): [string, RGB, RGB] => [`white on the ${f} folder`, WHITE, c(f)]),
    ...DARK_FOLDERS.map((f): [string, RGB, RGB] => [`white on the ${f} folder's dimmed note strip`, WHITE, over([0, 0, 0], 0.22, c(f))]),
    ...DARK_FOLDERS.map((f): [string, RGB, RGB] => [`folder caption on ${f}`, rule(".folder-cap"), c(f)]),
    ...(["signal", "cobalt", "emerald", "violet"] as const).map((f): [string, RGB, RGB] => [`white on a selected ${f} case card`, WHITE, c(f)]),
  ];
  for (const [label, fg, bg] of pairs) {
    it(`${label}: ${ratio(fg, bg).toFixed(2)}:1`, () => expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5));
  }
});

describe("folder tabs (16px italic text; inactive tabs are dimmed over the desk)", () => {
  const opacity = Number(css.match(/\.tab \{[^}]*opacity: ([\d.]+)/)![1]);
  for (const f of DARK_FOLDERS) {
    it(`inactive ${f} tab, white text`, () => {
      // The whole tab is dimmed: text and background both blend with the desk.
      const bg = over(c(f), opacity, desk);
      const fg = over(WHITE, opacity, desk);
      expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("inactive lemon tab, ink text", () => {
    expect(ratio(over(ink, opacity, desk), over(c("lemon"), opacity, desk))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("visible focus (3:1 against the surface it sits on)", () => {
  const focus = (surface: string) => {
    const scoped = css.match(new RegExp(`${surface}[^{]*:focus-visible[^{]*\\{[^}]*outline-color: var\\(--([a-z-]+)\\)`));
    return c(scoped ? scoped[1] : "lemon");
  };
  it("on the desk", () => expect(ratio(focus("^"), desk)).toBeGreaterThanOrEqual(3));
  it("on paper sheets", () => expect(ratio(focus("\\.card"), paper)).toBeGreaterThanOrEqual(3));
  it("on the case drawer", () => expect(ratio(focus("\\.side"), paper2)).toBeGreaterThanOrEqual(3));
  it("on the lemon folder", () => expect(ratio(focus("\\.folder\\[data-light\\]"), c("lemon"))).toBeGreaterThanOrEqual(3));
  for (const f of DARK_FOLDERS) it(`on the ${f} folder`, () => expect(ratio(c("lemon"), c(f))).toBeGreaterThanOrEqual(3));
});
