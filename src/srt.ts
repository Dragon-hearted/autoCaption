import fs from "node:fs";
import type { Caption } from "@remotion/captions";
import { createTikTokStyleCaptions } from "@remotion/captions";

/**
 * Format a millisecond offset as an SRT timestamp: `HH:MM:SS,mmm`.
 * Negative values are clamped to zero.
 */
export function formatSrtTimestamp(ms: number): string {
	const totalMs = Math.max(0, Math.round(ms));
	const hours = Math.floor(totalMs / 3_600_000);
	const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
	const seconds = Math.floor((totalMs % 60_000) / 1000);
	const millis = totalMs % 1000;

	const pad = (n: number, width = 2) => String(n).padStart(width, "0");
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/**
 * Convert word-level captions into SRT subtitle text.
 *
 * Word-level whisper tokens are grouped into readable subtitle cues using the
 * same TikTok-style page grouping the renderer uses, so the `.srt` output and
 * the burned-in captions line up.
 */
export function captionsToSrt(
	captions: Caption[],
	options: { combineTokensWithinMilliseconds?: number } = {},
): string {
	const combineTokensWithinMilliseconds =
		options.combineTokensWithinMilliseconds ?? 1200;

	const { pages } = createTikTokStyleCaptions({
		captions,
		combineTokensWithinMilliseconds,
	});

	const cues: string[] = [];
	let index = 0;

	for (const page of pages) {
		const text = page.text.trim();
		if (text === "") continue;

		// Prefer explicit token bounds for accurate start/end; fall back to the
		// page's own start/duration when a page has no tokens.
		const startMs = page.tokens.length
			? Math.min(...page.tokens.map((t) => t.fromMs))
			: page.startMs;
		const endMs = page.tokens.length
			? Math.max(...page.tokens.map((t) => t.toMs))
			: page.startMs + page.durationMs;

		index += 1;
		cues.push(
			`${index}\n${formatSrtTimestamp(startMs)} --> ${formatSrtTimestamp(
				Math.max(endMs, startMs),
			)}\n${text}`,
		);
	}

	// SRT files are conventionally terminated with a trailing newline.
	return cues.length ? `${cues.join("\n\n")}\n` : "";
}

/**
 * Write captions to an `.srt` file on disk and return the SRT string written.
 */
export function writeSrt(
	captions: Caption[],
	outputPath: string,
	options: { combineTokensWithinMilliseconds?: number } = {},
): string {
	const srt = captionsToSrt(captions, options);
	fs.writeFileSync(outputPath, srt);
	return srt;
}
