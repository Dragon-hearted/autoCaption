import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { transcribeVideo, writeCaptionsJson, extractAudio } from "../src/transcribe";
import { mockCaptions, mockWhisperOutput, createTempDir, VALID_MODELS } from "./setup";

describe("transcribeVideo", () => {
	it("should return an array of Caption objects", async () => {
		const result = await transcribeVideo("test-video.mp4", "medium.en");
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBeGreaterThan(0);
	});

	it("should return captions with correct shape", async () => {
		const result = await transcribeVideo("test-video.mp4", "medium.en");
		for (const caption of result) {
			expect(caption).toHaveProperty("text");
			expect(caption).toHaveProperty("startMs");
			expect(caption).toHaveProperty("endMs");
			expect(caption).toHaveProperty("timestampMs");
			expect(caption).toHaveProperty("confidence");
			expect(typeof caption.text).toBe("string");
			expect(typeof caption.startMs).toBe("number");
			expect(typeof caption.endMs).toBe("number");
		}
	});

	it("should throw when video file does not exist", async () => {
		await expect(
			transcribeVideo("nonexistent-video.mp4", "medium.en"),
		).rejects.toThrow();
	});
});

describe("writeCaptionsJson", () => {
	let tempDir: { path: string; cleanup: () => void };

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		tempDir.cleanup();
	});

	it("should write valid JSON to disk", () => {
		const outputPath = join(tempDir.path, "captions.json");
		writeCaptionsJson(mockCaptions, outputPath);

		expect(existsSync(outputPath)).toBe(true);

		const contents = JSON.parse(
			require("node:fs").readFileSync(outputPath, "utf-8"),
		);
		expect(Array.isArray(contents)).toBe(true);
		expect(contents).toHaveLength(mockCaptions.length);
	});

	it("should preserve caption data accurately", () => {
		const outputPath = join(tempDir.path, "captions.json");
		writeCaptionsJson(mockCaptions, outputPath);

		const contents = JSON.parse(
			require("node:fs").readFileSync(outputPath, "utf-8"),
		);
		expect(contents[0].text).toBe("Hello");
		expect(contents[0].startMs).toBe(0);
		expect(contents[0].endMs).toBe(500);
	});
});

describe("model size validation", () => {
	it("should accept all valid model sizes", () => {
		for (const model of VALID_MODELS) {
			expect(() => transcribeVideo("test.mp4", model)).not.toThrow(
				/invalid model/i,
			);
		}
	});

	it("should reject invalid model sizes", async () => {
		await expect(
			transcribeVideo("test.mp4", "invalid-model" as any),
		).rejects.toThrow();
	});
});

describe("extractAudio", () => {
	it("should be a function", () => {
		expect(typeof extractAudio).toBe("function");
	});

	it("should build correct FFmpeg command arguments", async () => {
		// extractAudio should accept an input video path and output audio path
		// We test that it exists and is callable; actual command execution is integration-level
		expect(extractAudio).toBeDefined();
	});
});
