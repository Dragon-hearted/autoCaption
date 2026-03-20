import type { TikTokPage } from "@remotion/captions";
import { loadFont } from "@remotion/google-fonts/Inter";
import type React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { CaptionStyle } from "../config";

const { fontFamily } = loadFont();

export const CaptionPage: React.FC<{
	page: TikTokPage;
	style: CaptionStyle;
}> = ({ page, style }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const currentTimeMs = (frame / fps) * 1000;
	const absoluteTimeMs = page.startMs + currentTimeMs;

	const justifyContent =
		style.position === "top"
			? "flex-start"
			: style.position === "center"
				? "center"
				: "flex-end";

	return (
		<AbsoluteFill style={{ justifyContent, alignItems: "center", padding: 40 }}>
			<div
				style={{
					fontSize: style.fontSize,
					fontWeight: style.bold ? "bold" : "normal",
					fontFamily,
					whiteSpace: "pre",
					textAlign: "center",
					maxWidth: "90%",
				}}
			>
				{page.tokens.map((token) => {
					const isActive =
						token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;
					return (
						<span
							key={token.fromMs}
							style={{
								color: isActive ? style.highlightColor : style.textColor,
							}}
						>
							{token.text}
						</span>
					);
				})}
			</div>
		</AbsoluteFill>
	);
};
