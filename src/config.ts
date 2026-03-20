import { z } from "zod";

export const CaptionStyleSchema = z.object({
	fontSize: z.number().default(80),
	fontFamily: z.string().default("Inter"),
	highlightColor: z.string().default("#39E508"),
	textColor: z.string().default("#FFFFFF"),
	position: z.enum(["top", "center", "bottom"]).default("bottom"),
	bold: z.boolean().default(true),
	combineTokensWithinMs: z.number().default(1200),
});

export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;

export const defaultCaptionStyle: CaptionStyle = CaptionStyleSchema.parse({});
