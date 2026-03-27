import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Caption } from "@remotion/captions";
import {
	downloadWhisperModel,
	installWhisperCpp,
} from "@remotion/install-whisper-cpp";

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

const WHISPER_PATH = path.join(process.cwd(), "whisper.cpp");
const WHISPER_VERSION = "1.5.5";

export async function ensureWhisperCpp(): Promise<void> {
	await installWhisperCpp({
		to: WHISPER_PATH,
		version: WHISPER_VERSION,
	});
}

export async function ensureModel(model: string): Promise<void> {
	await downloadWhisperModel({
		model: model as WhisperModel,
		folder: WHISPER_PATH,
	});
}

export function extractAudio(videoPath: string, outputPath: string): void {
	if (!fs.existsSync(videoPath)) {
		throw new Error(`Video file not found: ${videoPath}`);
	}
	execFileSync("ffmpeg", [
		"-i", videoPath,
		"-ar", "16000",
		"-ac", "1",
		"-c:a", "pcm_s16le",
		outputPath,
		"-y",
	]);
}

interface WhisperSegment {
	timestamps: { from: string; to: string };
	offsets: { from: number; to: number };
	text: string;
	tokens?: Array<{
		text: string;
		timestamps: { from: string; to: string };
		offsets: { from: number; to: number };
	}>;
}

interface WhisperJsonOutput {
	transcription: WhisperSegment[];
}

function whisperSegmentsToCaptions(segments: WhisperSegment[]): Caption[] {
	const captions: Caption[] = [];

	for (const segment of segments) {
		if (segment.tokens && segment.tokens.length > 0) {
			for (const token of segment.tokens) {
				if (token.text.trim() === "" && token.text !== " ") continue;
				captions.push({
					text: token.text,
					startMs: token.offsets.from,
					endMs: token.offsets.to,
					timestampMs: token.offsets.from,
					confidence: null,
				});
			}
		} else {
			captions.push({
				text: segment.text,
				startMs: segment.offsets.from,
				endMs: segment.offsets.to,
				timestampMs: segment.offsets.from,
				confidence: null,
			});
		}
	}

	return captions;
}

export async function transcribeVideo(
	videoPath: string,
	model: string,
): Promise<Caption[]> {
	if (!VALID_MODELS.includes(model as WhisperModel)) {
		throw new Error(`Invalid model: ${model}`);
	}

	if (!fs.existsSync(videoPath)) {
		throw new Error(`Video file not found: ${videoPath}`);
	}

	await ensureWhisperCpp();
	await ensureModel(model);

	const tempWav = path.join(os.tmpdir(), `autocaption_${Date.now()}.wav`);
	const tempJson = path.join(os.tmpdir(), `autocaption_${Date.now()}`);

	try {
		extractAudio(videoPath, tempWav);

		const mainBinary = path.join(WHISPER_PATH, "main");
		const modelFile = path.join(WHISPER_PATH, `ggml-${model}.bin`);

		const result = spawnSync(
			mainBinary,
			[
				"-m",
				modelFile,
				"-f",
				tempWav,
				"--output-json-full",
				"-of",
				tempJson,
			],
			{
				timeout: 300000,
				stdio: ["pipe", "pipe", "pipe"],
			},
		);

		if (result.status !== 0) {
			const stderr = result.stderr?.toString() || "";
			throw new Error(`Whisper transcription failed: ${stderr}`);
		}

		const jsonPath = `${tempJson}.json`;
		if (!fs.existsSync(jsonPath)) {
			throw new Error("Whisper did not produce JSON output");
		}

		const whisperOutput: WhisperJsonOutput = JSON.parse(
			fs.readFileSync(jsonPath, "utf-8"),
		);

		const captions = whisperSegmentsToCaptions(whisperOutput.transcription);

		// Clean up JSON output
		fs.unlinkSync(jsonPath);

		return captions;
	} finally {
		if (fs.existsSync(tempWav)) {
			fs.unlinkSync(tempWav);
		}
	}
}

export function writeCaptionsJson(
	captions: Caption[],
	outputPath: string,
): void {
	fs.writeFileSync(outputPath, JSON.stringify(captions, null, 2));
}
