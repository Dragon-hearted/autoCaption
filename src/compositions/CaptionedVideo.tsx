import type { Caption } from "@remotion/captions";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { AbsoluteFill, staticFile, useDelayRender, Video } from "remotion";
import { CaptionOverlay } from "../captions/CaptionOverlay";
import type { CaptionStyle } from "../config";
import { CaptionStyleSchema } from "../config";

export type CaptionedVideoProps = {
	videoSrc: string;
	captionsPath: string;
	style?: Partial<CaptionStyle>;
};

export const CaptionedVideo: React.FC<CaptionedVideoProps> = ({
	videoSrc,
	captionsPath,
	style: styleOverrides,
}) => {
	const [captions, setCaptions] = useState<Caption[] | null>(null);
	const { delayRender, continueRender, cancelRender } = useDelayRender();
	const [handle] = useState(() => delayRender());

	const captionStyle = CaptionStyleSchema.parse(styleOverrides ?? {});

	const fetchCaptions = useCallback(async () => {
		try {
			const response = await fetch(staticFile(captionsPath));
			const data = await response.json();
			setCaptions(data);
			continueRender(handle);
		} catch (e) {
			cancelRender(e);
		}
	}, [captionsPath, continueRender, cancelRender, handle]);

	useEffect(() => {
		fetchCaptions();
	}, [fetchCaptions]);

	if (!captions) {
		return null;
	}

	return (
		<AbsoluteFill>
			<Video src={staticFile(videoSrc)} />
			<CaptionOverlay captions={captions} style={captionStyle} />
		</AbsoluteFill>
	);
};
