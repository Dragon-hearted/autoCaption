// Adcelerate Design System — adapters/svg.ts
// Drop-in replacement for systems/readme-engine/src/renderers/svg/design-tokens.ts
// Export shape is identical; values come from the DS palette.
//
// Color mapping from original → DS:
//   indigo  (#6366F1) → oxblood  (#8B2A1D)  — brand primary
//   purple  (#8B5CF6) → petrol   (#1E5A7A)  — secondary accent
//   emerald (#10B981) → DS green (#0F5C3E)
//   amber   (#F59E0B) → DS amber (#B45309)
//   cyan    (#06B6D4) → petrol   (#1E5A7A)  — reuse
//   red     (#EF4444) → oxblood  (#8B2A1D)  — reuse
//
// DARK values use midnight-purple bg for SVGs that ride on dark bg per DS spec.

// ── Color Palette ──────────────────────────────────────────────
export const COLORS = {
  indigo:  "#8B2A1D",   // oxblood — brand primary replaces indigo
  purple:  "#1E5A7A",   // petrol — secondary accent
  emerald: "#0F5C3E",   // DS green
  amber:   "#B45309",   // DS amber
  cyan:    "#1E5A7A",   // petrol — reused for cyan slot
  red:     "#8B2A1D",   // oxblood — reused for red slot
} as const;

export const DARK = {
  cardFill:  "#0f0a1a",   // midnight-purple bg-primary
  text:      "#f3e8ff",   // midnight-purple text-primary
  secondary: "#d8b4fe",   // midnight-purple text-tertiary
  stroke:    "#6d28d9",   // midnight-purple border-primary
} as const;

// ── Fonts ──────────────────────────────────────────────────────
export const FONTS = {
  body: "Inter, system-ui, sans-serif",
  code: "JetBrains Mono, monospace",
} as const;

// ── Animation Timing ──────────────────────────────────────────
export const ANIM = {
  fadeIn:       { dur: "0.6s", fill: "freeze" },
  staggerStep:  0.3,
  breatheDelay: 3,
  breatheDur:   "4s",
  dashDur:      "2s",
  floatDur:     "3s",
  floatDistance: 3,
} as const;

// ── Canvas Defaults ───────────────────────────────────────────
export const CANVAS = {
  width: 800,
  xmlns: "http://www.w3.org/2000/svg",
} as const;

// ── Domain Tag → Color Mapping ────────────────────────────────
const TAG_COLOR_MAP: Record<string, string> = {
  scraping:       COLORS.cyan,
  ai:             COLORS.purple,
  media:          COLORS.amber,
  automation:     COLORS.emerald,
  analytics:      COLORS.indigo,
  marketing:      COLORS.red,
  infrastructure: COLORS.cyan,
  content:        COLORS.amber,
  data:           COLORS.indigo,
};

const COLOR_CYCLE = [
  COLORS.indigo,
  COLORS.purple,
  COLORS.emerald,
  COLORS.amber,
  COLORS.cyan,
  COLORS.red,
];

export function domainTagToColor(tags: string[]): string {
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (TAG_COLOR_MAP[key]) return TAG_COLOR_MAP[key];
  }
  // Deterministic fallback based on first tag hash
  if (tags.length > 0) {
    let hash = 0;
    for (const ch of tags[0]) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return COLOR_CYCLE[Math.abs(hash) % COLOR_CYCLE.length];
  }
  return COLORS.indigo;
}

// ── SVG Glow Filter Definitions ──────────────────────────────
export function glowFilterDefs(colors: string[]): string {
  const unique = [...new Set(colors)];
  const filters = unique.map((color, i) => {
    const id = `glow-${i}`;
    return `    <filter id="${id}" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
      <feFlood flood-color="${color}" flood-opacity="0.35" result="color" />
      <feComposite in="color" in2="blur" operator="in" result="glow" />
      <feMerge>
        <feMergeNode in="glow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>`;
  });
  return filters.join("\n");
}

export function glowFilterId(colors: string[], color: string): string {
  const unique = [...new Set(colors)];
  return `glow-${unique.indexOf(color)}`;
}

// ── Arrow Marker Definition ──────────────────────────────────
export function arrowMarkerDef(color: string, id = "arrow"): string {
  return `    <marker id="${id}" viewBox="0 0 10 6" refX="10" refY="3"
      markerWidth="8" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,3 L0,6 Z" fill="${color}" />
    </marker>`;
}

// ── SVG Primitives ────────────────────────────────────────────

/** Wrap full SVG document */
export function svgDoc(width: number, height: number, defsContent: string, body: string): string {
  return `<svg xmlns="${CANVAS.xmlns}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
${defsContent}
  </defs>
${body}
</svg>`;
}

/** Rounded rectangle with optional glow, stroke color, and fill */
export function glowRect(opts: {
  x: number;
  y: number;
  w: number;
  h: number;
  rx?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  filterId?: string;
}): string {
  const rx = opts.rx ?? 10;
  const fill = opts.fill ?? DARK.cardFill;
  const stroke = opts.stroke ?? DARK.stroke;
  const sw = opts.strokeWidth ?? 1.5;
  const filter = opts.filterId ? ` filter="url(#${opts.filterId})"` : "";
  return `<rect x="${opts.x}" y="${opts.y}" width="${opts.w}" height="${opts.h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${filter} />`;
}

/** Animated dashed connection line between two points */
export function animatedLine(opts: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  markerId?: string;
  delay?: number;
}): string {
  const color = opts.color ?? DARK.secondary;
  const delay = opts.delay ?? 0;
  const marker = opts.markerId ? ` marker-end="url(#${opts.markerId})"` : "";
  return `<line x1="${opts.x1}" y1="${opts.y1}" x2="${opts.x2}" y2="${opts.y2}"
    stroke="${color}" stroke-width="1.5" stroke-dasharray="6,4"${marker} opacity="0">
    <animate attributeName="opacity" from="0" to="1" dur="${ANIM.fadeIn.dur}" begin="${delay}s" fill="${ANIM.fadeIn.fill}" />
    <animate attributeName="stroke-dashoffset" from="20" to="0" dur="${ANIM.dashDur}" begin="${delay}s" repeatCount="indefinite" />
  </line>`;
}

/** A card node with label and optional description */
export function nodeCard(opts: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  description?: string;
  color: string;
  filterId?: string;
  delay?: number;
}): string {
  const delay = opts.delay ?? 0;
  const cx = opts.x + opts.w / 2;
  const labelY = opts.description ? opts.y + opts.h / 2 - 6 : opts.y + opts.h / 2 + 5;
  const fillOpacity = "0.08";

  let descLine = "";
  if (opts.description) {
    const maxChars = Math.floor(opts.w / 7);
    const desc = opts.description.length > maxChars
      ? opts.description.slice(0, maxChars - 1) + "…"
      : opts.description;
    descLine = `\n    <text x="${cx}" y="${opts.y + opts.h / 2 + 14}" text-anchor="middle" fill="${DARK.secondary}" font-family="${FONTS.body}" font-size="11">${escXml(desc)}</text>`;
  }

  return `  <g opacity="0">
    <animate attributeName="opacity" from="0" to="1" dur="${ANIM.fadeIn.dur}" begin="${delay}s" fill="${ANIM.fadeIn.fill}" />
    <animateTransform attributeName="transform" type="translate" values="0,0;0,-${ANIM.floatDistance};0,0" dur="${ANIM.floatDur}" begin="${ANIM.breatheDelay + delay}s" repeatCount="indefinite" />
    ${glowRect({ x: opts.x, y: opts.y, w: opts.w, h: opts.h, stroke: opts.color, fill: hexWithAlpha(opts.color, fillOpacity), filterId: opts.filterId })}
    <text x="${cx}" y="${labelY}" text-anchor="middle" fill="${DARK.text}" font-family="${FONTS.body}" font-size="13" font-weight="600">${escXml(opts.label)}</text>${descLine}
  </g>`;
}

/** Title text with optional glow filter */
export function titleText(opts: {
  x: number;
  y: number;
  text: string;
  size?: number;
  color?: string;
  filterId?: string;
  delay?: number;
}): string {
  const size = opts.size ?? 28;
  const color = opts.color ?? DARK.text;
  const delay = opts.delay ?? 0;
  const filter = opts.filterId ? ` filter="url(#${opts.filterId})"` : "";
  return `  <g opacity="0">
    <animate attributeName="opacity" from="0" to="1" dur="${ANIM.fadeIn.dur}" begin="${delay}s" fill="${ANIM.fadeIn.fill}" />
    <text x="${opts.x}" y="${opts.y}" text-anchor="middle" fill="${color}" font-family="${FONTS.body}" font-size="${size}" font-weight="700"${filter}>${escXml(opts.text)}</text>
  </g>`;
}

/** Decorative accent line (horizontal) */
export function accentLine(opts: {
  cx: number;
  y: number;
  width: number;
  color: string;
  delay?: number;
}): string {
  const delay = opts.delay ?? 0;
  const x1 = opts.cx - opts.width / 2;
  const x2 = opts.cx + opts.width / 2;
  return `  <line x1="${x1}" y1="${opts.y}" x2="${x2}" y2="${opts.y}" stroke="${opts.color}" stroke-width="2" stroke-linecap="round" opacity="0">
    <animate attributeName="opacity" from="0" to="0.7" dur="${ANIM.fadeIn.dur}" begin="${delay}s" fill="${ANIM.fadeIn.fill}" />
  </line>`;
}

// ── Helpers ───────────────────────────────────────────────────
export function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hexWithAlpha(hex: string, opacity: string): string {
  return `${hex}${Math.round(parseFloat(opacity) * 255).toString(16).padStart(2, "0")}`;
}
