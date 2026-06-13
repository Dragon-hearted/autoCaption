import { ThreeCanvas } from "@remotion/three";
import { ShaderGradient } from "@shadergradient/react";
import type React from "react";
import { createElement } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
// three ships no bundled type declarations in this project; we only touch the
// (untyped) ShaderChunk registry to back-fill chunks shadergradient expects.
// @ts-expect-error -- no type declarations for "three"
import { ShaderChunk } from "three";

// @shadergradient/react@2.4.x targets three ^0.169, but three 0.184 renamed /
// removed several GLSL chunks during the r152 color-management migration. Its
// material then fails to compile with "Can not resolve #include <...>". Back-fill
// the missing chunks so the gradient compiles + renders under headless Remotion:
//   - uv2_* were removed (the modern uv system covers the second UV set) -> no-op.
//   - encodings_* were renamed to colorspace_* -> alias to the modern chunk so
//     sRGB output encoding is preserved.
// Guarded so we never clobber a chunk that still exists in the installed three.
const shaderChunks = ShaderChunk as unknown as Record<string, string>;
const CHUNK_BACKFILL: Record<string, string> = {
	uv2_pars_vertex: "",
	uv2_vertex: "",
	uv2_pars_fragment: "",
	encodings_pars_fragment: shaderChunks.colorspace_pars_fragment ?? "",
	encodings_fragment: shaderChunks.colorspace_fragment ?? "",
};
for (const [name, value] of Object.entries(CHUNK_BACKFILL)) {
	if (shaderChunks[name] === undefined) {
		shaderChunks[name] = value;
	}
}

/**
 * Animated gradient background driven DETERMINISTICALLY by Remotion's frame
 * clock. We never let shadergradient animate on wall-clock time (`animate="off"`);
 * instead we compute `uTime = frame / fps` and feed it as an explicit prop so the
 * same frame always produces the same pixels — a hard requirement for Remotion's
 * parallel, out-of-order frame rendering.
 *
 * Prop contract (imported by the Timeline composition in src/pipeline/*):
 *   GradientBackground: React.FC<{ preset: string; colors?: string[] }>
 */

export type GradientPreset = "sunset" | "ocean" | "mono" | "brand";

type PresetConfig = {
	type: "plane" | "waterPlane" | "sphere";
	colors: [string, string, string];
	uStrength: number;
	uDensity: number;
	uFrequency: number;
	uSpeed: number;
};

const PRESETS: Record<GradientPreset, PresetConfig> = {
	sunset: {
		type: "waterPlane",
		colors: ["#ff6b6b", "#ffa94d", "#5f3dc4"],
		uStrength: 1.5,
		uDensity: 1.3,
		uFrequency: 5.5,
		uSpeed: 0.3,
	},
	ocean: {
		type: "waterPlane",
		colors: ["#0b486b", "#3b8686", "#79bd9a"],
		uStrength: 1.8,
		uDensity: 1.5,
		uFrequency: 5,
		uSpeed: 0.25,
	},
	mono: {
		type: "plane",
		colors: ["#0b0e14", "#222936", "#3a4252"],
		uStrength: 1.2,
		uDensity: 1.1,
		uFrequency: 4,
		uSpeed: 0.2,
	},
	brand: {
		type: "waterPlane",
		colors: ["#6c8cff", "#9b6cff", "#2b2f44"],
		uStrength: 1.6,
		uDensity: 1.4,
		uFrequency: 5.2,
		uSpeed: 0.3,
	},
};

/** Public list of preset names (handy for editor UIs and validation). */
export const GRADIENT_PRESETS = Object.keys(PRESETS) as GradientPreset[];

const isPreset = (value: string): value is GradientPreset =>
	Object.hasOwn(PRESETS, value);

/** Merge a caller-supplied color list over a preset's three base colors. */
const resolveColors = (
	base: [string, string, string],
	override?: string[],
): [string, string, string] => {
	if (!override || override.length === 0) {
		return base;
	}
	return [
		override[0] ?? base[0],
		override[1] ?? base[1],
		override[2] ?? base[2],
	];
};

export const GradientBackground: React.FC<{
	preset: string;
	colors?: string[];
}> = ({ preset, colors }) => {
	const frame = useCurrentFrame();
	const { fps, width, height } = useVideoConfig();

	const config = isPreset(preset) ? PRESETS[preset] : PRESETS.brand;
	const [color1, color2, color3] = resolveColors(config.colors, colors);

	// Deterministic clock: identical frame -> identical uTime -> identical output.
	const uTime = frame / fps;

	const gradient = createElement(ShaderGradient, {
		control: "props",
		animate: "off",
		uTime,
		uSpeed: config.uSpeed,
		uStrength: config.uStrength,
		uDensity: config.uDensity,
		uFrequency: config.uFrequency,
		type: config.type,
		color1,
		color2,
		color3,
	});

	// ThreeCanvas types `children` as a required prop, so it must be passed in
	// the props object rather than as a positional createElement child.
	const canvas = createElement(ThreeCanvas, {
		width,
		height,
		// biome-ignore lint/correctness/noChildrenProp: ThreeCanvas requires children in its prop type
		children: gradient,
	});

	return createElement(AbsoluteFill, null, canvas);
};
