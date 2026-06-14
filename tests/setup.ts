import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Caption } from "@remotion/captions";

export const VALID_MODELS = [
	"tiny",
	"tiny.en",
	"base",
	"base.en",
	"small",
	"small.en",
	"medium",
	"medium.en",
	"large-v1",
	"large-v2",
	"large-v3",
	"large-v3-turbo",
] as const;

export type WhisperModel = (typeof VALID_MODELS)[number];

export const mockCaptions: Caption[] = [
	{
		text: "Hello",
		startMs: 0,
		endMs: 500,
		timestampMs: 250,
		confidence: 0.95,
	},
	{
		text: " world",
		startMs: 500,
		endMs: 1000,
		timestampMs: 750,
		confidence: 0.92,
	},
	{
		text: " this",
		startMs: 1200,
		endMs: 1600,
		timestampMs: 1400,
		confidence: 0.88,
	},
	{
		text: " is",
		startMs: 1600,
		endMs: 1900,
		timestampMs: 1750,
		confidence: 0.97,
	},
	{
		text: " a",
		startMs: 1900,
		endMs: 2100,
		timestampMs: 2000,
		confidence: 0.99,
	},
	{
		text: " test",
		startMs: 2100,
		endMs: 2500,
		timestampMs: 2300,
		confidence: 0.91,
	},
	{
		text: " of",
		startMs: 3000,
		endMs: 3300,
		timestampMs: 3150,
		confidence: 0.93,
	},
	{
		text: " captions",
		startMs: 3300,
		endMs: 4000,
		timestampMs: 3650,
		confidence: 0.89,
	},
];

export const mockWhisperOutput = {
	transcription: [
		{
			timestamps: { from: "00:00:00.000", to: "00:00:00.500" },
			offsets: { from: 0, to: 500 },
			text: " Hello",
			tokens: [
				{
					id: 1,
					text: " Hello",
					timestamps: { from: "00:00:00.000", to: "00:00:00.500" },
					p: 0.95,
				},
			],
		},
		{
			timestamps: { from: "00:00:00.500", to: "00:00:01.000" },
			offsets: { from: 500, to: 1000 },
			text: " world",
			tokens: [
				{
					id: 2,
					text: " world",
					timestamps: { from: "00:00:00.500", to: "00:00:01.000" },
					p: 0.92,
				},
			],
		},
		{
			timestamps: { from: "00:00:01.200", to: "00:00:02.500" },
			offsets: { from: 1200, to: 2500 },
			text: " this is a test",
			tokens: [
				{
					id: 3,
					text: " this",
					timestamps: { from: "00:00:01.200", to: "00:00:01.600" },
					p: 0.88,
				},
				{
					id: 4,
					text: " is",
					timestamps: { from: "00:00:01.600", to: "00:00:01.900" },
					p: 0.97,
				},
				{
					id: 5,
					text: " a",
					timestamps: { from: "00:00:01.900", to: "00:00:02.100" },
					p: 0.99,
				},
				{
					id: 6,
					text: " test",
					timestamps: { from: "00:00:02.100", to: "00:00:02.500" },
					p: 0.91,
				},
			],
		},
		{
			timestamps: { from: "00:00:03.000", to: "00:00:04.000" },
			offsets: { from: 3000, to: 4000 },
			text: " of captions",
			tokens: [
				{
					id: 7,
					text: " of",
					timestamps: { from: "00:00:03.000", to: "00:00:03.300" },
					p: 0.93,
				},
				{
					id: 8,
					text: " captions",
					timestamps: { from: "00:00:03.300", to: "00:00:04.000" },
					p: 0.89,
				},
			],
		},
	],
};

export function createTempDir(): { path: string; cleanup: () => void } {
	const path = mkdtempSync(join(tmpdir(), "auto-editor-test-"));
	return {
		path,
		cleanup: () => rmSync(path, { recursive: true, force: true }),
	};
}
