import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli";
import { createTempDir } from "./setup";

describe("parseArgs", () => {
	let tempDir: { path: string; cleanup: () => void };
	let videoPath: string;

	beforeEach(() => {
		tempDir = createTempDir();
		videoPath = join(tempDir.path, "test-video.mp4");
		writeFileSync(videoPath, "fake video content");
	});

	afterEach(() => {
		tempDir.cleanup();
	});

	it("should extract video path from positional args", () => {
		const result = parseArgs([videoPath]);
		expect(result.videoPath).toBe(videoPath);
	});

	it("should extract --output flag", () => {
		const result = parseArgs([videoPath, "--output", "/tmp/output.mp4"]);
		expect(result.output).toBe("/tmp/output.mp4");
	});

	it("should extract -o shorthand flag", () => {
		const result = parseArgs([videoPath, "-o", "/tmp/output.mp4"]);
		expect(result.output).toBe("/tmp/output.mp4");
	});

	it("should extract --model flag", () => {
		const result = parseArgs([videoPath, "--model", "large"]);
		expect(result.model).toBe("large");
	});

	it("should extract -m shorthand flag", () => {
		const result = parseArgs([videoPath, "-m", "small.en"]);
		expect(result.model).toBe("small.en");
	});

	it("should default model to medium.en", () => {
		const result = parseArgs([videoPath]);
		expect(result.model).toBe("medium.en");
	});

	it("should extract --srt-only flag", () => {
		const result = parseArgs([videoPath, "--srt-only"]);
		expect(result.srtOnly).toBe(true);
	});

	it("should default srt-only to false", () => {
		const result = parseArgs([videoPath]);
		expect(result.srtOnly).toBe(false);
	});

	it("should extract --keep-captions flag", () => {
		const result = parseArgs([videoPath, "--keep-captions"]);
		expect(result.keepCaptions).toBe(true);
	});

	it("should extract --font-size with value", () => {
		const result = parseArgs([videoPath, "--font-size", "120"]);
		expect(result.fontSize).toBe(120);
	});

	it("should default font-size to 80", () => {
		const result = parseArgs([videoPath]);
		expect(result.fontSize).toBe(80);
	});

	it("should extract --position with value", () => {
		const result = parseArgs([videoPath, "--position", "center"]);
		expect(result.position).toBe("center");
	});

	it("should default position to bottom", () => {
		const result = parseArgs([videoPath]);
		expect(result.position).toBe("bottom");
	});

	it("should extract --highlight-color with value", () => {
		const result = parseArgs([videoPath, "--highlight-color", "#FF0000"]);
		expect(result.highlightColor).toBe("#FF0000");
	});

	it("should default highlight-color to #39E508", () => {
		const result = parseArgs([videoPath]);
		expect(result.highlightColor).toBe("#39E508");
	});

	it("should throw when no video path is provided", () => {
		expect(() => parseArgs([])).toThrow();
	});

	it("should throw when video file does not exist", () => {
		expect(() => parseArgs(["/nonexistent/path/video.mp4"])).toThrow();
	});

	it("should handle --help flag", () => {
		expect(() => parseArgs(["--help"])).toThrow(/usage/i);
	});
});
