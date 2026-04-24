// Adcelerate Design System — adapters/gif.ts
// Remotion composition constants for gif-kit and future GIF/video exports.
// Pure constants — no Remotion import (avoids peer-dep in this package).

// ── Composition Definitions ───────────────────────────────────
export const compositions = {
  brandIntro: {
    width:            800,
    height:           800,
    fps:              30,
    durationInFrames: 120,  // 4s at 30fps
  },
  socialSquare: {
    width:            1080,
    height:           1080,
    fps:              30,
    durationInFrames: 90,   // 3s at 30fps
  },
  vertical1080: {
    width:            1080,
    height:           1920,
    fps:              30,
    durationInFrames: 150,  // 5s at 30fps
  },
} as const;

// ── Motion Timings (in frames at 30fps) ──────────────────────
export const motion = {
  fadeIn:     18,   // 0.6s
  holdTitle:  60,   // 2.0s
  crossfade:  12,   // 0.4s
} as const;
