// Adcelerate Design System — adapters/chalk.ts
// Drop-in replacement for systems/pinboard/tui/src/theme.ts
// peer-dep: chalk@^5 (ESM — installed by consumer, not this package)
import chalk from "chalk";

// ── DS color values ───────────────────────────────────────────
export const colors = {
  paper:       "#EEE6D4",   // brand-paper — default surface
  paperHi:     "#F5EEDC",   // brand-paper-hi — raised
  paperShadow: "#E6DCC6",   // brand-paper-sh — recessed
  ink:         "#1A1714",   // brand-ink — text on paper
  muted:       "#6B5F4F",   // brand-muted — meta text
  cocoa:       "#5A4632",   // brand-cocoa — neutral emphasis
  oxblood:     "#8B2A1D",   // brand-oxblood — primary / CTAs
  petrol:      "#1E5A7A",   // brand-petrol — info / secondary accent
  amber:       "#B45309",   // brand-amber — warning
  green:       "#0F5C3E",   // brand-green — success
} as const;

export type ColorName = keyof typeof colors;

// ── Wrapper functions (DS names) ──────────────────────────────
export const paper       = (text: string) => chalk.hex(colors.paper)(text);
export const paperHi     = (text: string) => chalk.hex(colors.paperHi)(text);
export const paperShadow = (text: string) => chalk.hex(colors.paperShadow)(text);
export const ink         = (text: string) => chalk.hex(colors.ink)(text);
export const muted       = (text: string) => chalk.hex(colors.muted)(text);
export const cocoa       = (text: string) => chalk.hex(colors.cocoa)(text);
export const oxblood     = (text: string) => chalk.hex(colors.oxblood)(text);
export const petrol      = (text: string) => chalk.hex(colors.petrol)(text);
export const amber       = (text: string) => chalk.hex(colors.amber)(text);
export const green       = (text: string) => chalk.hex(colors.green)(text);

// ── caption() helper — preserved verbatim from pinboard/tui/src/theme.ts ──
export const caption = (text: string) =>
  text.toUpperCase().split(/\s+/).filter(Boolean).join("  ");

// ── Legacy aliases — one-line migration for pinboard/tui ─────
// Maps all 8 original names to their DS equivalents.
// stoneGray and mistBorder both land on muted (slightly darker variant is fine).
export const warmParchment = paper;       // "#faf9f6" → paper "#EEE6D4"
export const ashGray       = muted;       // "#afaeac" → muted "#6B5F4F"
export const stoneGray     = muted;       // "#868584" → muted (acceptable — close neutral)
export const earthGray     = ink;         // "#353534" → ink   "#1A1714"
export const mistBorder    = muted;       // "#555555" → muted "#6B5F4F"
export const linkGray      = muted;       // "#666469" → muted "#6B5F4F"
export const mutedOchre    = amber;       // "#8a7539" → amber "#B45309"
export const mutedRust     = oxblood;     // "#8a4a3a" → oxblood "#8B2A1D"
