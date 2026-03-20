import { describe, it, expect } from "vitest";
import { getOutputPath, renderVideo, RenderOptionsSchema } from "../src/render";

describe("getOutputPath", () => {
	it("should generate default output path from input path", () => {
		const result = getOutputPath("video.mp4");
		expect(result).toBe("video_captioned.mp4");
	});

	it("should handle paths with directories", () => {
		const result = getOutputPath("/Users/test/videos/my-video.mp4");
		expect(result).toBe("/Users/test/videos/my-video_captioned.mp4");
	});

	it("should return custom output path when provided", () => {
		const result = getOutputPath("video.mp4", "/output/custom.mp4");
		expect(result).toBe("/output/custom.mp4");
	});

	it("should handle different video extensions", () => {
		const result = getOutputPath("clip.mov");
		expect(result).toBe("clip_captioned.mov");
	});
});

describe("RenderOptionsSchema", () => {
	it("should validate a minimal render options object", () => {
		const result = RenderOptionsSchema.parse({
			inputPath: "video.mp4",
			outputPath: "video_captioned.mp4",
		});

		expect(result.inputPath).toBe("video.mp4");
		expect(result.outputPath).toBe("video_captioned.mp4");
	});

	it("should reject missing required fields", () => {
		expect(() => RenderOptionsSchema.parse({})).toThrow();
	});

	it("should accept optional fields", () => {
		const result = RenderOptionsSchema.parse({
			inputPath: "video.mp4",
			outputPath: "video_captioned.mp4",
			codec: "h264",
		});

		expect(result.codec).toBe("h264");
	});
});

describe("renderVideo", () => {
	it("should be a callable function", () => {
		expect(typeof renderVideo).toBe("function");
	});
});
