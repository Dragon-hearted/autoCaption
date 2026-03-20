import { createTikTokStyleCaptions } from "@remotion/captions";
import { describe, expect, it } from "vitest";
import { CaptionStyleSchema } from "../src/config";
import { mockCaptions } from "./setup";

describe("createTikTokStyleCaptions", () => {
	it("should produce pages from mock caption data", () => {
		const { pages } = createTikTokStyleCaptions({
			captions: mockCaptions,
			combineTokensWithinMilliseconds: 1200,
		});

		expect(Array.isArray(pages)).toBe(true);
		expect(pages.length).toBeGreaterThan(0);
	});

	it("should produce pages with startMs property", () => {
		const { pages } = createTikTokStyleCaptions({
			captions: mockCaptions,
			combineTokensWithinMilliseconds: 1200,
		});

		for (const page of pages) {
			expect(page).toHaveProperty("startMs");
			expect(typeof page.startMs).toBe("number");
		}
	});

	it("should produce pages with tokens array", () => {
		const { pages } = createTikTokStyleCaptions({
			captions: mockCaptions,
			combineTokensWithinMilliseconds: 1200,
		});

		for (const page of pages) {
			expect(page).toHaveProperty("tokens");
			expect(Array.isArray(page.tokens)).toBe(true);
		}
	});

	it("should produce tokens with fromMs and toMs properties", () => {
		const { pages } = createTikTokStyleCaptions({
			captions: mockCaptions,
			combineTokensWithinMilliseconds: 1200,
		});

		for (const page of pages) {
			for (const token of page.tokens) {
				expect(token).toHaveProperty("fromMs");
				expect(token).toHaveProperty("toMs");
				expect(typeof token.fromMs).toBe("number");
				expect(typeof token.toMs).toBe("number");
			}
		}
	});

	it("should return empty pages for empty captions array", () => {
		const { pages } = createTikTokStyleCaptions({
			captions: [],
			combineTokensWithinMilliseconds: 1200,
		});

		expect(pages).toHaveLength(0);
	});

	it("should produce fewer pages with larger combineTokensWithinMilliseconds", () => {
		const { pages: pages500 } = createTikTokStyleCaptions({
			captions: mockCaptions,
			combineTokensWithinMilliseconds: 500,
		});

		const { pages: pages1200 } = createTikTokStyleCaptions({
			captions: mockCaptions,
			combineTokensWithinMilliseconds: 1200,
		});

		const { pages: pages3000 } = createTikTokStyleCaptions({
			captions: mockCaptions,
			combineTokensWithinMilliseconds: 3000,
		});

		// Larger combineTokens value should result in same or fewer pages
		expect(pages3000.length).toBeLessThanOrEqual(pages1200.length);
		expect(pages1200.length).toBeLessThanOrEqual(pages500.length);
	});
});

describe("CaptionStyleSchema", () => {
	it("should validate with default values", () => {
		const result = CaptionStyleSchema.parse({});
		expect(result).toBeDefined();
	});

	it("should accept valid custom values", () => {
		const result = CaptionStyleSchema.parse({
			fontSize: 100,
			position: "center",
			highlightColor: "#FF0000",
		});

		expect(result.fontSize).toBe(100);
		expect(result.position).toBe("center");
		expect(result.highlightColor).toBe("#FF0000");
	});

	it("should reject invalid values", () => {
		expect(() =>
			CaptionStyleSchema.parse({
				fontSize: "not-a-number",
			}),
		).toThrow();
	});

	it("should reject invalid position values", () => {
		expect(() =>
			CaptionStyleSchema.parse({
				position: "invalid-position",
			}),
		).toThrow();
	});
});
