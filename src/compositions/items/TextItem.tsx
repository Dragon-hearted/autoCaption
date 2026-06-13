import { loadFont } from "@remotion/google-fonts/Inter";
import type React from "react";
import {
	AbsoluteFill,
	interpolate,
	spring,
	useCurrentFrame,
	useVideoConfig,
} from "remotion";
import type { TextItem as TextItemSpec } from "../../types/project";

const { fontFamily } = loadFont();

/**
 * Renders a single `text` item with a simple spring slide + fade-in.
 * Positioned via `position` (top/center/bottom) and optional x/y offset.
 */
export const TextItem: React.FC<{ item: TextItemSpec }> = ({ item }) => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();

	const enter = spring({
		frame,
		fps,
		config: { damping: 200 },
		durationInFrames: 15,
	});
	const opacity = interpolate(enter, [0, 1], [0, 1]);
	const translateY = interpolate(enter, [0, 1], [40, 0]);

	const justifyContent =
		item.position === "top"
			? "flex-start"
			: item.position === "center"
				? "center"
				: "flex-end";

	return (
		<AbsoluteFill style={{ justifyContent, alignItems: "center", padding: 40 }}>
			<div
				style={{
					transform: `translate(${item.x ?? 0}px, ${(item.y ?? 0) + translateY}px)`,
					opacity,
					fontFamily,
					fontSize: item.fontSize ?? 80,
					fontWeight: "bold",
					color: item.color ?? "#FFFFFF",
					textAlign: "center",
					whiteSpace: "pre-wrap",
					maxWidth: "90%",
				}}
			>
				{item.text}
			</div>
		</AbsoluteFill>
	);
};
