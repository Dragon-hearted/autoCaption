import type { Caption } from "@remotion/captions";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type React from "react";
import { useMemo } from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { CaptionStyle } from "../config";
import { CaptionPage } from "./CaptionPage";

export const CaptionOverlay: React.FC<{
	captions: Caption[];
	style: CaptionStyle;
}> = ({ captions, style }) => {
	const { fps } = useVideoConfig();

	const { pages } = useMemo(() => {
		return createTikTokStyleCaptions({
			captions,
			combineTokensWithinMilliseconds: style.combineTokensWithinMs,
		});
	}, [captions, style.combineTokensWithinMs]);

	return (
		<AbsoluteFill>
			{pages.map((page, index) => {
				const nextPage = pages[index + 1] ?? null;
				const startFrame = (page.startMs / 1000) * fps;
				const endFrame = Math.min(
					nextPage ? (nextPage.startMs / 1000) * fps : Infinity,
					startFrame + (style.combineTokensWithinMs / 1000) * fps,
				);
				const durationInFrames = Math.max(1, Math.round(endFrame - startFrame));

				return (
					<Sequence
						key={`page-${page.startMs}`}
						from={Math.round(startFrame)}
						durationInFrames={durationInFrames}
					>
						<CaptionPage page={page} style={style} />
					</Sequence>
				);
			})}
		</AbsoluteFill>
	);
};
