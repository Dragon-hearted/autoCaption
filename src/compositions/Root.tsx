import type React from "react";
import { Composition, registerRoot } from "remotion";
import { CaptionedVideo } from "./CaptionedVideo";

const RemotionRoot: React.FC = () => {
	return (
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
	);
};

registerRoot(RemotionRoot);
