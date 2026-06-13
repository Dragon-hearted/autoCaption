import { z } from "zod";

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

export const BackgroundSpecSchema = z.object({
	kind: z.enum(["gradient", "color", "none"]).default("none"),
	preset: z.string().optional(),
	colors: z.array(z.string()).optional(),
	color: z.string().optional(),
});

export type BackgroundSpec = z.infer<typeof BackgroundSpecSchema>;

// ---------------------------------------------------------------------------
// Items (discriminated union on `kind`)
// ---------------------------------------------------------------------------

export const VideoItemSchema = z.object({
	kind: z.literal("video"),
	id: z.string(),
	src: z.string(),
	from: z.number().int().default(0),
	durationInFrames: z.number().int().positive(),
	trimBefore: z.number().int().optional(),
	x: z.number().optional(),
	y: z.number().optional(),
	width: z.number().optional(),
	height: z.number().optional(),
});

export type VideoItem = z.infer<typeof VideoItemSchema>;

export const TextItemSchema = z.object({
	kind: z.literal("text"),
	id: z.string(),
	text: z.string(),
	from: z.number().int().default(0),
	durationInFrames: z.number().int().positive(),
	fontSize: z.number().optional(),
	color: z.string().optional(),
	x: z.number().optional(),
	y: z.number().optional(),
	position: z.enum(["top", "center", "bottom"]).optional(),
});

export type TextItem = z.infer<typeof TextItemSchema>;

export const CaptionItemSchema = z.object({
	kind: z.literal("caption"),
	id: z.string(),
	captionsPath: z.string(),
	from: z.number().int().default(0),
	durationInFrames: z.number().int().positive(),
	fontSize: z.number().optional(),
	highlightColor: z.string().optional(),
	position: z.enum(["top", "center", "bottom"]).optional(),
});

export type CaptionItem = z.infer<typeof CaptionItemSchema>;

export const MotionClipItemSchema = z.object({
	kind: z.literal("motionClip"),
	id: z.string(),
	// Rendered mp4 (relative to public/, or absolute). Produced by Hyperframes.
	src: z.string(),
	// Optional authoring info so the doc is self-describing / re-renderable: the
	// Hyperframes template name and the props injected into it. When present, the
	// `edit` CLI regenerates `src` from these if the mp4 is missing.
	template: z.string().optional(),
	props: z.record(z.string(), z.unknown()).optional(),
	from: z.number().int().default(0),
	durationInFrames: z.number().int().positive(),
});

export type MotionClipItem = z.infer<typeof MotionClipItemSchema>;

export const GradientItemSchema = z.object({
	kind: z.literal("gradient"),
	id: z.string(),
	preset: z.string(),
	colors: z.array(z.string()).optional(),
	from: z.number().int().default(0),
	durationInFrames: z.number().int().positive(),
});

export type GradientItem = z.infer<typeof GradientItemSchema>;

export const ItemSchema = z.discriminatedUnion("kind", [
	VideoItemSchema,
	TextItemSchema,
	CaptionItemSchema,
	MotionClipItemSchema,
	GradientItemSchema,
]);

export type Item = z.infer<typeof ItemSchema>;

// ---------------------------------------------------------------------------
// Track + Project
// ---------------------------------------------------------------------------

export const TrackSchema = z.object({
	id: z.string(),
	name: z.string(),
	items: z.array(ItemSchema).default([]),
});

export type Track = z.infer<typeof TrackSchema>;

export const ProjectSchema = z.object({
	id: z.string(),
	title: z.string(),
	fps: z.number().positive().default(30),
	width: z.number().int().positive(),
	height: z.number().int().positive(),
	durationInFrames: z.number().int().positive(),
	background: BackgroundSpecSchema.optional(),
	tracks: z.array(TrackSchema).default([]),
});

export type Project = z.infer<typeof ProjectSchema>;

// ---------------------------------------------------------------------------
// Factories + helpers
// ---------------------------------------------------------------------------

/**
 * Build a valid Project with sensible defaults (1080x1920, 30fps).
 * Any field can be overridden; the result is parsed so it is always valid.
 */
export function defaultProject(overrides?: Partial<Project>): Project {
	return ProjectSchema.parse({
		id: "project",
		title: "Untitled",
		fps: 30,
		width: 1080,
		height: 1920,
		durationInFrames: 30 * 10,
		background: { kind: "none" },
		tracks: [],
		...overrides,
	});
}

/**
 * Parse an unknown value into a Project, throwing a readable error on failure.
 */
export function validateProject(input: unknown): Project {
	const result = ProjectSchema.safeParse(input);
	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => {
				const path = issue.path.join(".") || "(root)";
				return `  - ${path}: ${issue.message}`;
			})
			.join("\n");
		throw new Error(`Invalid project:\n${issues}`);
	}
	return result.data;
}
