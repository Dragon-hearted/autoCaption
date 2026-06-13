import type React from "react";
import { Composition, registerRoot } from "remotion";
import { defaultProject, type Project } from "../types/project";
import { CaptionedVideo } from "./CaptionedVideo";
import { Timeline } from "./Timeline";

// A small example Project used as default props for the Timeline composition.
const exampleProject: Project = defaultProject({
	id: "example",
	title: "Example Timeline",
	durationInFrames: 90,
	background: { kind: "color", color: "#101014" },
	tracks: [
		{
			id: "main",
			name: "Main",
			items: [
				{
					kind: "text",
					id: "hello",
					text: "Hello Timeline",
					from: 0,
					durationInFrames: 90,
					position: "center",
				},
			],
		},
	],
});

const RemotionRoot: React.FC = () => {
	return (
		<>
			<Composition
				id="CaptionedVideo"
				component={CaptionedVideo}
				durationInFrames={30 * 60}
				fps={30}
				width={1080}
				height={1920}
				defaultProps={{
					videoSrc: "video.mp4",
					captionsPath: "captions.json",
				}}
			/>
			<Composition
				id="Timeline"
				component={Timeline}
				durationInFrames={exampleProject.durationInFrames}
				fps={exampleProject.fps}
				width={exampleProject.width}
				height={exampleProject.height}
				defaultProps={{ project: exampleProject }}
				calculateMetadata={({ props }) => {
					const { project } = props;
					return {
						durationInFrames: project.durationInFrames,
						fps: project.fps,
						width: project.width,
						height: project.height,
					};
				}}
			/>
		</>
	);
};

registerRoot(RemotionRoot);
