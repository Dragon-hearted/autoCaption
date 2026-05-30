#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { getOutputPath, renderVideo } from "./render";
import { writeSrt } from "./srt";
import { transcribeVideo, VALID_MODELS, writeCaptionsJson } from "./transcribe";

export interface ParsedArgs {
	videoPath: string;
	output?: string;
	model: string;
	srtOnly: boolean;
	keepCaptions: boolean;
	fontSize: number;
	position: string;
	highlightColor: string;
}

const HELP_TEXT = `Usage: autocaption <video_path> [options]

Arguments:
  video_path              Path to the input video file

Options:
  -o, --output <path>     Output path (default: <input>_captioned.mp4)
  -m, --model <model>     Whisper model (default: medium.en)
  --srt-only              Write an .srt subtitle file only, no render
  --keep-captions         Keep captions JSON after render
  --font-size <size>      Caption font size (default: 80)
  --position <pos>        Caption position: top, center, bottom (default: bottom)
  --highlight-color <hex> Word highlight color (default: #39E508)
  -h, --help              Show this help message

Valid models: ${VALID_MODELS.join(", ")}
`;

export function parseArgs(argv: string[]): ParsedArgs {
	if (argv.includes("--help") || argv.includes("-h")) {
		throw new Error(
			`Usage: autocaption <video_path> [options]\n\n${HELP_TEXT}`,
		);
	}

	let videoPath: string | undefined;
	let output: string | undefined;
	let model = "medium.en";
	let srtOnly = false;
	let keepCaptions = false;
	let fontSize = 80;
	let position = "bottom";
	let highlightColor = "#39E508";

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];

		if (arg === "--output" || arg === "-o") {
			output = argv[++i];
		} else if (arg === "--model" || arg === "-m") {
			model = argv[++i];
		} else if (arg === "--srt-only") {
			srtOnly = true;
		} else if (arg === "--keep-captions") {
			keepCaptions = true;
		} else if (arg === "--font-size") {
			fontSize = Number(argv[++i]);
		} else if (arg === "--position") {
			position = argv[++i];
		} else if (arg === "--highlight-color") {
			highlightColor = argv[++i];
		} else if (!arg.startsWith("-")) {
			videoPath = arg;
		}
	}

	if (!videoPath) {
		throw new Error("No video path provided. Run with --help for usage.");
	}

	if (!fs.existsSync(videoPath)) {
		throw new Error(`Video file not found: ${videoPath}`);
	}

	return {
		videoPath,
		output,
		model,
		srtOnly,
		keepCaptions,
		fontSize,
		position,
		highlightColor,
	};
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));

	console.log(`Transcribing ${args.videoPath} with model ${args.model}...`);

	const captions = await transcribeVideo(args.videoPath, args.model);
	console.log(`Found ${captions.length} captions.`);

	const publicDir = path.resolve(process.cwd(), "public");
	if (!fs.existsSync(publicDir)) {
		fs.mkdirSync(publicDir, { recursive: true });
	}

	const captionsJsonPath = path.join(publicDir, "captions.json");
	writeCaptionsJson(captions, captionsJsonPath);
	console.log(`Captions written to ${captionsJsonPath}`);

	if (args.srtOnly) {
		const srtPath = getOutputPath(args.videoPath, args.output).replace(
			/\.[^./\\]+$/,
			".srt",
		);
		writeSrt(captions, srtPath);
		console.log(`SRT written to ${srtPath}`);

		if (!args.keepCaptions) {
			fs.unlinkSync(captionsJsonPath);
		}

		console.log("SRT-only mode — skipping render.");
		return;
	}

	const videoBasename = path.basename(args.videoPath);
	const publicVideoPath = path.join(publicDir, videoBasename);
	if (!fs.existsSync(publicVideoPath)) {
		fs.copyFileSync(args.videoPath, publicVideoPath);
	}

	const outputPath = getOutputPath(args.videoPath, args.output);

	console.log(`Rendering captioned video to ${outputPath}...`);

	await renderVideo({
		inputPath: publicVideoPath,
		outputPath,
		compositionId: "CaptionedVideo",
		captionsJsonPath,
		style: {
			fontSize: args.fontSize,
			position: args.position,
			highlightColor: args.highlightColor,
		},
		onProgress: (stage: string, progress: number) => {
			process.stdout.write(`\r${stage}: ${Math.round(progress * 100)}%`);
		},
	});

	console.log(`\nDone! Output: ${outputPath}`);

	if (!args.keepCaptions) {
		fs.unlinkSync(captionsJsonPath);
	}
}

const isMainModule =
	typeof require !== "undefined"
		? require.main === module
		: import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
	main().catch((err) => {
		console.error(err.message);
		process.exit(1);
	});
}
