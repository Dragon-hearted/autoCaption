// @ts-nocheck
// Adcelerate Design System — adapters/pdf.ts
// react-pdf compatible styles and font registration.
//
// peer-dep: @react-pdf/renderer (installed by consumer in systems/pdf-kit — NOT in design-system/)
// This file uses @ts-nocheck because @react-pdf/renderer is not installed in this package.
// Type errors will surface in the consumer when the dep is present.

// peer-dep: @react-pdf/renderer (installed by consumer)
import { Font, StyleSheet } from "@react-pdf/renderer";

// ── Font Registration ─────────────────────────────────────────
// Uses Google Fonts TTF URLs. Call registerFonts() once at app init.
export function registerFonts(): void {
  Font.register({
    family: "Inter",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2",
        fontWeight: 400,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hiA.woff2",
        fontWeight: 500,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hiA.woff2",
        fontWeight: 600,
      },
      {
        src: "https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiA.woff2",
        fontWeight: 700,
      },
    ],
  });

  Font.register({
    family: "JetBrains Mono",
    fonts: [
      {
        src: "https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjOlbZMtk.woff2",
        fontWeight: 400,
      },
      {
        src: "https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8SKtjOlbZMtk.woff2",
        fontWeight: 500,
      },
    ],
  });

  Font.register({
    family: "Archivo Black",
    src: "https://fonts.gstatic.com/s/archivoblack/v23/HTxqL289NzCGg4MzN6KJ7eW6OYuP_x7ysHc.woff2",
    fontWeight: 400,
  });
}

// ── DS color constants (paper theme — default for PDF) ────────
const C = {
  primary:       "#8B2A1D",   // oxblood
  bgPrimary:     "#EEE6D4",   // paper
  bgSecondary:   "#F5EEDC",
  bgTertiary:    "#E6DCC6",
  textPrimary:   "#1A1714",
  textSecondary: "#2A241E",
  textTertiary:  "#6B5F4F",
  border:        "rgba(26,23,20,0.3)",
  success:       "#0F5C3E",
  warning:       "#B45309",
  white:         "#FFFFFF",
} as const;

// ── StyleSheet ────────────────────────────────────────────────
export const pdfStyles = StyleSheet.create({
  page: {
    backgroundColor: C.bgPrimary,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    fontFamily: "Inter",
    fontSize: 10,
    color: C.textPrimary,
  },

  cover: {
    backgroundColor: C.textPrimary,   // ink — dark cover page
    paddingTop: 80,
    paddingBottom: 80,
    paddingHorizontal: 56,
    alignItems: "flex-start",
    justifyContent: "flex-end",
    flex: 1,
  },

  h1: {
    fontFamily: "Archivo Black",
    fontSize: 28,
    fontWeight: 400,
    color: C.textPrimary,
    lineHeight: 1.2,
    letterSpacing: -0.4,
    marginBottom: 12,
  },

  h2: {
    fontFamily: "Inter",
    fontSize: 20,
    fontWeight: 700,
    color: C.textPrimary,
    lineHeight: 1.2,
    letterSpacing: -0.3,
    marginBottom: 8,
    marginTop: 24,
  },

  h3: {
    fontFamily: "Inter",
    fontSize: 14,
    fontWeight: 600,
    color: C.textPrimary,
    lineHeight: 1.4,
    marginBottom: 6,
    marginTop: 16,
  },

  body: {
    fontFamily: "Inter",
    fontSize: 10,
    fontWeight: 400,
    color: C.textPrimary,
    lineHeight: 1.5,
    marginBottom: 6,
  },

  meta: {
    fontFamily: "Inter",
    fontSize: 8,
    fontWeight: 500,
    color: C.textTertiary,
    lineHeight: 1.4,
  },

  mono: {
    fontFamily: "JetBrains Mono",
    fontSize: 9,
    fontWeight: 400,
    color: C.textTertiary,
    backgroundColor: C.bgTertiary,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
  },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 56,
    right: 56,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderTopStyle: "solid",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
