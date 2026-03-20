import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { z } from "zod";

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
		videoSrc: parsed.inputPath,
		captionsPath:
			parsed.captionsJsonPath ?? parsed.inputPath.replace(/\.[^.]+$/, ".json"),
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
