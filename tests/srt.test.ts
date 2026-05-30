import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { captionsToSrt, formatSrtTimestamp, writeSrt } from "../src/srt";
import { createTempDir, mockCaptions } from "./setup";

describe("formatSrtTimestamp", () => {
	it("should format zero as 00:00:00,000", () => {
		expect(formatSrtTimestamp(0)).toBe("00:00:00,000");
	});

	it("should format milliseconds with comma separator", () => {
		expect(formatSrtTimestamp(1500)).toBe("00:00:01,500");
	});

	it("should format minutes and seconds", () => {
		expect(formatSrtTimestamp(65_000)).toBe("00:01:05,000");
	});

	it("should format hours", () => {
		expect(formatSrtTimestamp(3_661_250)).toBe("01:01:01,250");
	});

	it("should clamp negative values to zero", () => {
		expect(formatSrtTimestamp(-100)).toBe("00:00:00,000");
	});

	it("should round fractional milliseconds", () => {
		expect(formatSrtTimestamp(999.6)).toBe("00:00:01,000");
	});
});

describe("captionsToSrt", () => {
	it("should produce non-empty SRT for mock captions", () => {
		const srt = captionsToSrt(mockCaptions);
		expect(srt.length).toBeGreaterThan(0);
	});

	it("should number cues sequentially starting at 1", () => {
		const srt = captionsToSrt(mockCaptions);
		const indexLines = srt
			.split("\n\n")
			.filter((b) => b.trim() !== "")
			.map((block) => block.split("\n")[0]);
		expect(indexLines[0]).toBe("1");
		indexLines.forEach((line, i) => {
			expect(line).toBe(String(i + 1));
		});
	});

	it("should include a timestamp arrow line for every cue", () => {
		const srt = captionsToSrt(mockCaptions);
		const arrowLines = srt.split("\n").filter((l) => l.includes(" --> "));
		expect(arrowLines.length).toBeGreaterThan(0);
		for (const line of arrowLines) {
			expect(line).toMatch(
				/^\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}$/,
			);
		}
	});

	it("should include caption text content", () => {
		const srt = captionsToSrt(mockCaptions);
		expect(srt).toContain("Hello");
		expect(srt).toContain("captions");
	});

	it("should end with a trailing newline", () => {
		const srt = captionsToSrt(mockCaptions);
		expect(srt.endsWith("\n")).toBe(true);
	});

	it("should return empty string for empty captions", () => {
		expect(captionsToSrt([])).toBe("");
	});

	it("should produce cues whose end is at or after start", () => {
		const srt = captionsToSrt(mockCaptions);
		const arrowLines = srt.split("\n").filter((l) => l.includes(" --> "));
		for (const line of arrowLines) {
			const [start, end] = line.split(" --> ");
			expect(end >= start).toBe(true);
		}
	});
});

describe("writeSrt", () => {
	let tempDir: { path: string; cleanup: () => void };

	beforeEach(() => {
		tempDir = createTempDir();
	});

	afterEach(() => {
		tempDir.cleanup();
	});

	it("should write an .srt file to disk", () => {
		const outputPath = join(tempDir.path, "out.srt");
		writeSrt(mockCaptions, outputPath);
		expect(existsSync(outputPath)).toBe(true);
	});

	it("should write the same content it returns", () => {
		const outputPath = join(tempDir.path, "out.srt");
		const returned = writeSrt(mockCaptions, outputPath);
		const onDisk = readFileSync(outputPath, "utf-8");
		expect(onDisk).toBe(returned);
	});

	it("should write a parseable SRT with numbered cues", () => {
		const outputPath = join(tempDir.path, "out.srt");
		writeSrt(mockCaptions, outputPath);
		const onDisk = readFileSync(outputPath, "utf-8");
		expect(onDisk).toMatch(/^1\n\d{2}:\d{2}:\d{2},\d{3} --> /);
	});
});
