import type { Caption } from "@remotion/captions";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { staticFile, useDelayRender } from "remotion";
import { z } from "zod";
import { CaptionOverlay } from "../../captions/CaptionOverlay";
import { CaptionStyleSchema } from "../../config";
import type { CaptionItem as CaptionItemSpec } from "../../types/project";

/** Runtime guard so malformed caption JSON fails loudly at fetch time. */
const CaptionsArraySchema: z.ZodType<Caption[]> = z.array(
	z.object({
		text: z.string(),
		startMs: z.number(),
		endMs: z.number(),
		timestampMs: z.number().nullable(),
		confidence: z.number().nullable(),
	}),
);

/**
 * Loads captions JSON referenced by a `caption` item and renders the existing
 * CaptionOverlay. Caption styling fields on the item override config defaults.
 */
export const CaptionItem: React.FC<{ item: CaptionItemSpec }> = ({ item }) => {
	const [captions, setCaptions] = useState<Caption[] | null>(null);
	const { delayRender, continueRender, cancelRender } = useDelayRender();
	const [handle] = useState(() => delayRender());
	// useDelayRender() returns fresh continueRender/cancelRender references each
	// render. Capturing them in refs keeps fetchCaptions' deps stable so the
	// fetch effect runs once instead of re-firing on every render.
	const continueRenderRef = useRef(continueRender);
	const cancelRenderRef = useRef(cancelRender);
	continueRenderRef.current = continueRender;
	cancelRenderRef.current = cancelRender;

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
			setCaptions(CaptionsArraySchema.parse(data));
			continueRenderRef.current(handle);
		} catch (e) {
			cancelRenderRef.current(e);
		}
	}, [item.captionsPath, handle]);

	useEffect(() => {
		fetchCaptions();
	}, [fetchCaptions]);

	if (!captions) {
		return null;
	}

	return <CaptionOverlay captions={captions} style={style} />;
};
