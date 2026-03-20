import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Caption } from "@remotion/captions";
import {
	downloadWhisperModel,
	installWhisperCpp,
	toCaptions,
	transcribe,
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
	execSync(
		`ffmpeg -i ${videoPath} -ar 16000 -ac 1 -c:a pcm_s16le ${outputPath} -y`,
	);
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

	try {
		extractAudio(videoPath, tempWav);

		const whisperCppOutput = await transcribe({
			model: model as WhisperModel,
			whisperPath: WHISPER_PATH,
			whisperCppVersion: WHISPER_VERSION,
			inputPath: tempWav,
			tokenLevelTimestamps: true,
		});

		const { captions } = toCaptions({ whisperCppOutput });

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
