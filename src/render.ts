import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { z } from "zod";
import type { Project } from "./types/project";

export const RenderOptionsSchema = z.object({
	inputPath: z.string(),
	outputPath: z.string(),
	codec: z.string().optional(),
	compositionId: z.string().default("CaptionedVideo"),
	captionsJsonPath: z.string().optional(),
	style: z.record(z.string(), z.unknown()).optional(),
	onProgress: z.function().optional(),
});

export type RenderOptions = z.infer<typeof RenderOptionsSchema>;

export function getOutputPath(
	inputPath: string,
	customOutput?: string,
): string {
	if (customOutput) {
		return customOutput;
	}
	const ext = path.extname(inputPath);
	const base = inputPath.slice(0, -ext.length);
	return `${base}_captioned${ext}`;
}

export async function renderVideo(options: RenderOptions): Promise<string> {
	const parsed = RenderOptionsSchema.parse(options);

	const bundled = await bundle({
		entryPoint: path.resolve(__dirname, "compositions/Root.tsx"),
		onProgress: (progress: number) => {
			if (typeof parsed.onProgress === "function") {
				(parsed.onProgress as (stage: string, progress: number) => void)(
					"bundling",
					progress,
				);
			}
		},
	});

	const inputProps = {
		videoSrc: path.basename(parsed.inputPath),
		captionsPath: parsed.captionsJsonPath
			? path.basename(parsed.captionsJsonPath)
			: path.basename(parsed.inputPath).replace(/\.[^.]+$/, ".json"),
		...(parsed.style ? { style: parsed.style } : {}),
	};

	const composition = await selectComposition({
		serveUrl: bundled,
		id: parsed.compositionId,
		inputProps,
	});

	await renderMedia({
		composition,
		serveUrl: bundled,
		codec: (parsed.codec as "h264" | "h265" | undefined) ?? "h264",
		outputLocation: parsed.outputPath,
		inputProps,
		onProgress: ({ progress }) => {
			if (typeof parsed.onProgress === "function") {
				(parsed.onProgress as (stage: string, progress: number) => void)(
					"rendering",
					progress,
				);
			}
		},
	});

	return parsed.outputPath;
}

export interface RenderProjectOptions {
	project: Project;
	outputPath: string;
	codec?: "h264" | "h265";
	onProgress?: (stage: string, progress: number) => void;
}

/**
 * Render an editable Project document to an mp4 by bundling Root.tsx, selecting
 * the `Timeline` composition, and passing the Project as inputProps. The
 * composition's calculateMetadata derives fps/width/height/duration from it.
 */
export async function renderProject(
	options: RenderProjectOptions,
): Promise<string> {
	const { project, outputPath, codec, onProgress } = options;

	const bundled = await bundle({
		entryPoint: path.resolve(__dirname, "compositions/Root.tsx"),
		onProgress: (progress: number) => {
			onProgress?.("bundling", progress);
		},
	});

	const inputProps = { project };

	const composition = await selectComposition({
		serveUrl: bundled,
		id: "Timeline",
		inputProps,
	});

	await renderMedia({
		composition,
		serveUrl: bundled,
		codec: codec ?? "h264",
		outputLocation: outputPath,
		inputProps,
		onProgress: ({ progress }) => {
			onProgress?.("rendering", progress);
		},
	});

	return outputPath;
}
