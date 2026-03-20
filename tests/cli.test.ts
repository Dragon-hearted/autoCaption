import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli";
import { getOutputPath } from "../src/render";
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

describe("CLI integration", () => {
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

	describe("output naming", () => {
		it("should generate default output path from input video", () => {
			const result = getOutputPath(videoPath);
			expect(result).toBe(videoPath.replace(".mp4", "_captioned.mp4"));
		});

		it("should use custom output path when --output is provided", () => {
			const customOutput = join(tempDir.path, "custom-output.mp4");
			const args = parseArgs([videoPath, "--output", customOutput]);
			const result = getOutputPath(args.videoPath, args.output);
			expect(result).toBe(customOutput);
		});

		it("should handle different video extensions for output naming", () => {
			const movPath = join(tempDir.path, "clip.mov");
			writeFileSync(movPath, "fake mov content");
			const result = getOutputPath(movPath);
			expect(result).toBe(movPath.replace(".mov", "_captioned.mov"));
		});
	});

	describe("--srt-only mode", () => {
		it("should set srtOnly flag correctly", () => {
			const args = parseArgs([videoPath, "--srt-only"]);
			expect(args.srtOnly).toBe(true);
			expect(args.keepCaptions).toBe(false);
		});

		it("should combine with other flags", () => {
			const args = parseArgs([videoPath, "--srt-only", "--model", "tiny.en"]);
			expect(args.srtOnly).toBe(true);
			expect(args.model).toBe("tiny.en");
		});
	});

	describe("--keep-captions mode", () => {
		it("should set keepCaptions flag correctly", () => {
			const args = parseArgs([videoPath, "--keep-captions"]);
			expect(args.keepCaptions).toBe(true);
		});

		it("should combine with output flag", () => {
			const customOutput = join(tempDir.path, "out.mp4");
			const args = parseArgs([
				videoPath,
				"--keep-captions",
				"--output",
				customOutput,
			]);
			expect(args.keepCaptions).toBe(true);
			expect(args.output).toBe(customOutput);
		});
	});

	describe("full pipeline args", () => {
		it("should parse all flags together", () => {
			const customOutput = join(tempDir.path, "final.mp4");
			const args = parseArgs([
				videoPath,
				"--output",
				customOutput,
				"--model",
				"base.en",
				"--font-size",
				"100",
				"--position",
				"top",
				"--highlight-color",
				"#FF0000",
				"--keep-captions",
			]);

			expect(args.videoPath).toBe(videoPath);
			expect(args.output).toBe(customOutput);
			expect(args.model).toBe("base.en");
			expect(args.fontSize).toBe(100);
			expect(args.position).toBe("top");
			expect(args.highlightColor).toBe("#FF0000");
			expect(args.keepCaptions).toBe(true);
			expect(args.srtOnly).toBe(false);
		});

		it("should accept flags before and after positional arg", () => {
			const args = parseArgs([
				"--model",
				"tiny",
				videoPath,
				"--font-size",
				"60",
			]);
			expect(args.videoPath).toBe(videoPath);
			expect(args.model).toBe("tiny");
			expect(args.fontSize).toBe(60);
		});
	});
});
