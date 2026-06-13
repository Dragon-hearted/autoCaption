import type { Caption } from "@remotion/captions";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import { CaptionOverlay } from "../../captions/CaptionOverlay";
import { CaptionStyleSchema } from "../../config";
import type { CaptionItem as CaptionItemSpec } from "../../types/project";

/**
 * Loads captions JSON referenced by a `caption` item and renders the existing
 * CaptionOverlay. Caption styling fields on the item override config defaults.
 */
export const CaptionItem: React.FC<{ item: CaptionItemSpec }> = ({ item }) => {
	const [captions, setCaptions] = useState<Caption[] | null>(null);
	const { delayRender, continueRender, cancelRender } = useDelayRender();
	const [handle] = useState(() => delayRender());

	const style = CaptionStyleSchema.parse({
		...(item.fontSize !== undefined ? { fontSize: item.fontSize } : {}),
		...(item.highlightColor !== undefined
			? { highlightColor: item.highlightColor }
			: {}),
		...(item.position !== undefined ? { position: item.position } : {}),
	});

	const fetchCaptions = useCallback(async () => {
		try {
			const response = await fetch(staticFile(item.captionsPath));
			const data = await response.json();
			setCaptions(data);
			continueRender(handle);
		} catch (e) {
			cancelRender(e);
		}
	}, [item.captionsPath, continueRender, cancelRender, handle]);

	useEffect(() => {
		fetchCaptions();
	}, [fetchCaptions]);

	if (!captions) {
		return null;
	}

	return <CaptionOverlay captions={captions} style={style} />;
};
