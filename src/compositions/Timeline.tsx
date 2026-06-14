import type React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile } from "remotion";
import { GradientBackground } from "../pipeline/backgrounds";
import type { BackgroundSpec, Item, Project, Track } from "../types/project";
import { CaptionItem } from "./items/CaptionItem";
import { TextItem } from "./items/TextItem";

/** Resolve an asset path: pass remote URLs through, wrap local paths in staticFile. */
function resolveSrc(src: string): string {
	return /^(https?:)?\/\//.test(src) ? src : staticFile(src);
}

const ItemRenderer: React.FC<{ item: Item }> = ({ item }) => {
	switch (item.kind) {
		case "video":
		case "motionClip": {
			const style: React.CSSProperties =
				item.kind === "video"
					? {
							left: item.x,
							top: item.y,
							width: item.width,
							height: item.height,
						}
					: {};
			return (
				<AbsoluteFill>
					<OffthreadVideo
						src={resolveSrc(item.src)}
						trimBefore={item.kind === "video" ? item.trimBefore : undefined}
						style={style}
					/>
				</AbsoluteFill>
			);
		}
		case "text":
			return <TextItem item={item} />;
		case "caption":
			return <CaptionItem item={item} />;
		case "gradient":
			return (
				<AbsoluteFill>
					<GradientBackground preset={item.preset} colors={item.colors} />
				</AbsoluteFill>
			);
	}
};

const TrackLayer: React.FC<{ track: Track }> = ({ track }) => {
	return (
		<AbsoluteFill>
			{track.items.map((item) => (
				<Sequence
					key={item.id}
					from={item.from}
					durationInFrames={item.durationInFrames}
				>
					<ItemRenderer item={item} />
				</Sequence>
			))}
		</AbsoluteFill>
	);
};

const ProjectBackground: React.FC<{ background: BackgroundSpec }> = ({
	background,
}) => {
	switch (background.kind) {
		case "gradient":
			return (
				<AbsoluteFill>
					<GradientBackground
						preset={background.preset ?? "default"}
						colors={background.colors}
					/>
				</AbsoluteFill>
			);
		case "color":
			return (
				<AbsoluteFill
					style={{ backgroundColor: background.color ?? "#000000" }}
				/>
			);
		default:
			return null;
	}
};

/**
 * Renders an editable Project: a project-level background behind all tracks,
 * each track layered as an AbsoluteFill, each item placed with a Sequence.
 */
export const Timeline: React.FC<{ project: Project }> = ({ project }) => {
	return (
		<AbsoluteFill style={{ backgroundColor: "#000000" }}>
			{project.background ? (
				<ProjectBackground background={project.background} />
			) : null}
			{project.tracks.map((track) => (
				<TrackLayer key={track.id} track={track} />
			))}
		</AbsoluteFill>
	);
};
