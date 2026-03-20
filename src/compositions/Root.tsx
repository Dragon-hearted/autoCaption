import { Composition } from "remotion";

export const RemotionRoot: React.FC = () => {
	return (
		<>
			<Composition
				id="CaptionedVideo"
				component={() => null}
				durationInFrames={1}
				fps={30}
				width={1080}
				height={1920}
			/>
		</>
	);
};
