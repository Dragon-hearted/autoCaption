import { z } from "zod";
import { COLORS as DS_COLORS, FONT as DS_FONT } from "../vendor/design-system/adapters/remotion";

export const CaptionStyleSchema = z.object({
	fontSize: z.number().default(80),
	fontFamily: z.string().default("Inter"), // matches DS_FONT ("Inter" stack)
	highlightColor: z.string().default("#B45309"), // DS brand-amber (design-system/tokens.css :root --brand-amber)
	textColor: z.string().default("#FFFFFF"), // kept #FFFFFF for high contrast over arbitrary video backgrounds
	position: z.enum(["top", "center", "bottom"]).default("bottom"),
	bold: z.boolean().default(true),
	combineTokensWithinMs: z.number().default(1200),
});

export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;

export const defaultCaptionStyle: CaptionStyle = CaptionStyleSchema.parse({});
