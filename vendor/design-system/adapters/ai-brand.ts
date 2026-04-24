// Adcelerate Design System — adapters/ai-brand.ts
// Generates structured AI image-generation context strings for Adcelerate surfaces.

type Surface = "character-sheet" | "product-shot" | "storyboard-frame" | "cover-art";
type Theme   = "paper" | "dark" | "midnight-purple";

interface BrandContextOptions {
  surface: Surface;
  theme?: Theme;
  mood?: string;
}

const PALETTE_BLOCKS: Record<Theme, string> = {
  paper: `
  Background surface : #EEE6D4 (warm parchment — default)
  Primary / CTA      : #8B2A1D (oxblood)
  Secondary accent   : #1E5A7A (petrol)
  Warning            : #B45309 (amber)
  Success            : #0F5C3E (deep green)
  Neutral emphasis   : #5A4632 (cocoa)
  Text on surface    : #1A1714 (ink)`.trim(),

  dark: `
  Background surface : #111827 (dark gray)
  Primary / CTA      : #60a5fa (blue-400)
  Secondary accent   : #34d399 (emerald)
  Warning            : #fbbf24 (amber)
  Error              : #f87171 (rose)
  Text on surface    : #f9fafb (near-white)`.trim(),

  "midnight-purple": `
  Background surface : #0f0a1a (near-black purple)
  Primary / CTA      : #a78bfa (violet-400)
  Secondary accent   : #8B2A1D (oxblood — brand mark on dark)
  Success            : #34d399 (emerald)
  Warning            : #fbbf24 (amber)
  Text on surface    : #f3e8ff (lavender-white)`.trim(),
};

const SURFACE_GUIDANCE: Record<Surface, string> = {
  "character-sheet": `
Surface: 6-panel character reference sheet.
Layout: front / 3/4 / back / close-up face / hands detail / expression grid.
Background: neutral (off-white or very light paper tone), not patterned.
Lighting: consistent studio — no dramatic rim lights; even, top-slightly-angled.
Line art: clean, no hatching. Flat cel shading or near-flat.
No logos, no text overlays, no speech bubbles.`.trim(),

  "product-shot": `
Surface: single product on minimal background.
Background: solid or near-solid — parchment, dark gray, or deep purple depending on theme.
Lighting: soft side-fill, minimal shadow cast.
No hands, no people, no lifestyle context.
Cropping: centered, 10% breathing room on all sides.`.trim(),

  "storyboard-frame": `
Surface: single cinematic frame for a video storyboard.
Aspect ratio: 16:9 composition within the frame.
Style: sketch / rough thumbnail — not polished illustration.
Include basic scene blocking, no color (grayscale preferred).
Annotate camera angle in the gutter if space allows.`.trim(),

  "cover-art": `
Surface: square cover art (1:1). Primary use: social, video thumbnail.
Center the focal subject in the upper 60% of the frame.
Title-safe zone: lower 25% reserved for text overlay — keep it simple / uncluttered.
Flat or semi-flat illustration. Pixel-art accents acceptable.
No photography. No 3D renders.`.trim(),
};

export function brandContextPrompt({ surface, theme = "paper", mood }: BrandContextOptions): string {
  const palette = PALETTE_BLOCKS[theme];
  const surfaceGuide = SURFACE_GUIDANCE[surface];
  const moodLine = mood ? `\nMood / tone: ${mood}` : "";

  return `
=== Adcelerate Brand Context ===

PALETTE (theme: ${theme})
${palette}

TYPOGRAPHY
Sans: Inter (400/500/600/700/800)
Display: Archivo Black — heavy geometric, H1 only
Code/mono: JetBrains Mono

VOICE RULES (apply to any copy or UI text in the asset)
- Terse, imperative, CLI-help-style
- Third-person task framing — no "you" or "we"
- No marketing fluff. No exclamation points.
- Casing: PascalCase event types, sentence-case labels, kebab-case IDs

BANNED IMAGERY
- NO photography
- NO 3D renders
- NO full-bleed photographic backgrounds
- Flat surfaces only; pixel-art accents OK; animated SVG hub-and-spoke OK
- No gradients unless extremely subtle (max 5% shift)

SURFACE GUIDANCE
${surfaceGuide}${moodLine}

================================
`.trim();
}
