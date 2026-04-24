// Adcelerate Design System — adapters/remotion.ts
// Drop-in replacement for systems/pinboard/demo/src/theme.ts
// Exports COLORS + FONT (compat with demo) plus a richer `theme` export.

// ── COLORS ────────────────────────────────────────────────────
// Maps DS midnight-purple dark theme for Remotion compositions.
export const COLORS = {
  // Backgrounds (midnight-purple bg scale)
  bgDeepest: "#0f0a1a",     // midnight-purple bg-primary
  bgMid:     "#1a1333",     // midnight-purple bg-secondary
  bgLight:   "#2d1b4e",     // midnight-purple bg-tertiary

  // Brand primary
  accent:      "#8B2A1D",   // DS oxblood — replaces terracotta/coral accent
  accentHover: "#6E2116",   // DS oxblood dark

  // Semantic
  sage: "#0F5C3E",          // DS green — replaces muted sage

  // Text
  textPrimary:   "#f3e8ff",                  // midnight-purple text-primary
  textSecondary: "rgba(243,232,255,0.7)",    // midnight-purple text @ 70%
  textSubtle:    "rgba(243,232,255,0.4)",    // midnight-purple text @ 40%

  // Structural
  border: "rgba(255,255,255,0.08)",
} as const;

// ── FONT ──────────────────────────────────────────────────────
export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ── Per-theme variants ────────────────────────────────────────
// Richer export for compositions that support multiple DS themes.
export const theme = {
  paper: {
    bgDeepest:    "#EEE6D4",
    bgMid:        "#F5EEDC",
    bgLight:      "#E6DCC6",
    accent:       "#8B2A1D",
    accentHover:  "#6E2116",
    sage:         "#0F5C3E",
    textPrimary:  "#1A1714",
    textSecondary: "rgba(26,23,20,0.7)",
    textSubtle:   "rgba(26,23,20,0.4)",
    border:       "rgba(26,23,20,0.08)",
    font: FONT,
  },
  dark: {
    bgDeepest:    "#111827",
    bgMid:        "#1f2937",
    bgLight:      "#374151",
    accent:       "#60a5fa",
    accentHover:  "#3b82f6",
    sage:         "#34d399",
    textPrimary:  "#f9fafb",
    textSecondary: "rgba(249,250,251,0.7)",
    textSubtle:   "rgba(249,250,251,0.4)",
    border:       "rgba(255,255,255,0.08)",
    font: FONT,
  },
  "midnight-purple": {
    bgDeepest:    "#0f0a1a",
    bgMid:        "#1a1333",
    bgLight:      "#2d1b4e",
    accent:       "#8B2A1D",   // oxblood brand primary
    accentHover:  "#6E2116",
    sage:         "#0F5C3E",
    textPrimary:  "#f3e8ff",
    textSecondary: "rgba(243,232,255,0.7)",
    textSubtle:   "rgba(243,232,255,0.4)",
    border:       "rgba(255,255,255,0.08)",
    font: FONT,
  },
} as const;
