#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import {
	renderMotionClip,
	resolveTemplatePath,
} from "./pipeline/motion-graphics";
import {
	buildComparePlan,
	buildFinalPlan,
	buildPalmierPlan,
	type Selection,
} from "./pipeline/palmier-plan";
import { sliceProject } from "./pipeline/scene-slicer";
import { getOutputPath, renderProject, renderVideo } from "./render";
import { writeSrt } from "./srt";
import { transcribeVideo, VALID_MODELS, writeCaptionsJson } from "./transcribe";
import { type Project, validateProject } from "./types/project";

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

export interface EditArgs {
	projectPath: string;
	output?: string;
}

export interface ServeArgs {
	port: number;
	projectPath?: string;
}

export interface SliceArgs {
	projectDir: string;
}

export type PlanMode = "concat" | "compare" | "final";

export interface PlanArgs {
	projectDir: string;
	mode: PlanMode;
	/** Path to a selection.json — required when mode === "final". */
	selection?: string;
}

export type Command =
	| { type: "caption"; args: ParsedArgs }
	| { type: "edit"; args: EditArgs }
	| { type: "serve"; args: ServeArgs }
	| { type: "slice"; args: SliceArgs }
	| { type: "plan"; args: PlanArgs }
	| { type: "help" };

export const SUBCOMMANDS = [
	"caption",
	"edit",
	"serve",
	"slice",
	"plan",
] as const;

const HELP_TEXT = `Usage: auto-editor <command> [options]

Commands:
  caption <video>         Transcribe a video and render burned-in captions
  edit <project.json>     Render an editable Project document to mp4
  serve [project.json]    Start the interactive browser editor
  slice <project-dir>     Slice a storyboard project's block videos into
                          per-scene clips + scenes.json (in <project>/scenes/)
  plan <project-dir>      Order a sliced project's clips into a palmier plan.
                          --mode concat (default) → scenes/palmier-plan.json;
                          --mode compare → scenes/palmier-compare-plan.json
                          (A/B parallel-track slots); --mode final --selection
                          <sel.json> → scenes/palmier-final-plan.json (winners)

Back-compat:
  auto-editor <video>     If the first argument is a video file (not a command),
                          it is treated as "caption <video>".

caption options:
  -o, --output <path>     Output path (default: <input>_captioned.mp4)
  -m, --model <model>     Whisper model (default: medium.en)
  --srt-only              Write an .srt subtitle file only, no render
  --keep-captions         Keep captions JSON after render
  --font-size <size>      Caption font size (default: 80)
  --position <pos>        Caption position: top, center, bottom (default: bottom)
  --highlight-color <hex> Word highlight color (default: #39E508)

edit options:
  -o, --output <path>     Output mp4 path (default: <project>.mp4)

serve options:
  [project.json]          Project file to open (default: project.json in cwd)
  -p, --port <number>     Port to listen on (default: 4321)

slice options:
  <project-dir>           Storyboard project dir (e.g. client/x/storyboards/y)

plan options:
  <project-dir>           Sliced storyboard project dir (must have scenes.json)
  --mode <m>              concat (default) | compare | final
  --selection <path>      Per-scene winners JSON (required for --mode final)

  -h, --help              Show this help message

Examples:
  auto-editor caption clip.mp4 --font-size 100 --position center
  auto-editor clip.mp4                       # same as: caption clip.mp4
  auto-editor edit project.json -o out.mp4
  auto-editor serve --port 4321
  auto-editor slice client/comet/storyboards/one-pair-three-lives
  auto-editor plan client/comet/storyboards/one-pair-three-lives
  auto-editor plan client/comet/storyboards/one-pair-three-lives --mode compare
  auto-editor plan <dir> --mode final --selection scenes/selection.json

Valid models: ${VALID_MODELS.join(", ")}
`;

export function parseArgs(argv: string[]): ParsedArgs {
	if (argv.includes("--help") || argv.includes("-h")) {
		throw new Error(
			`Usage: auto-editor <video_path> [options]\n\n${HELP_TEXT}`,
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

export function parseEditArgs(argv: string[]): EditArgs {
	let projectPath: string | undefined;
	let output: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--output" || arg === "-o") {
			output = argv[++i];
		} else if (!arg.startsWith("-")) {
			projectPath = arg;
		}
	}

	if (!projectPath) {
		throw new Error("No project file provided. Run with --help for usage.");
	}

	if (!fs.existsSync(projectPath)) {
		throw new Error(`Project file not found: ${projectPath}`);
	}

	return { projectPath, output };
}

export function parseServeArgs(argv: string[]): ServeArgs {
	let port = 4321;
	let projectPath: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--port" || arg === "-p") {
			const raw = argv[++i];
			const parsed = Number(raw);
			if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
				throw new Error(
					`Invalid port: ${raw}. Expected an integer between 1 and 65535.`,
				);
			}
			port = parsed;
		} else if (!arg.startsWith("-")) {
			projectPath = arg;
		}
	}

	return { port, projectPath };
}

export function parseSliceArgs(argv: string[]): SliceArgs {
	let projectDir: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith("-")) projectDir = arg;
	}

	if (!projectDir) {
		throw new Error(
			"No storyboard project directory provided. Run with --help for usage.",
		);
	}

	if (!fs.existsSync(projectDir)) {
		throw new Error(`Project directory not found: ${projectDir}`);
	}
	if (!fs.statSync(projectDir).isDirectory()) {
		throw new Error(`Not a directory: ${projectDir}`);
	}

	return { projectDir };
}

export function parsePlanArgs(argv: string[]): PlanArgs {
	let projectDir: string | undefined;
	let mode: PlanMode = "concat";
	let selection: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--mode") {
			const raw = argv[++i];
			if (raw !== "concat" && raw !== "compare" && raw !== "final") {
				throw new Error(
					`Invalid --mode: ${raw}. Expected concat, compare, or final.`,
				);
			}
			mode = raw;
		} else if (arg === "--selection") {
			selection = argv[++i];
		} else if (!arg.startsWith("-")) {
			projectDir = arg;
		}
	}

	if (!projectDir) {
		throw new Error(
			"No storyboard project directory provided. Run with --help for usage.",
		);
	}

	if (!fs.existsSync(projectDir)) {
		throw new Error(`Project directory not found: ${projectDir}`);
	}
	if (!fs.statSync(projectDir).isDirectory()) {
		throw new Error(`Not a directory: ${projectDir}`);
	}

	if (mode === "final") {
		if (!selection) {
			throw new Error(
				"--mode final requires --selection <path.json> (per-scene winners).",
			);
		}
		if (!fs.existsSync(selection)) {
			throw new Error(`Selection file not found: ${selection}`);
		}
	}

	return { projectDir, mode, selection };
}

/**
 * Dispatch argv to a subcommand. Keeps full back-compat: a first argument that
 * is not a known subcommand falls through to the caption parser (so old
 * positional invocations like `auto-editor clip.mp4 --font-size 100` work).
 */
export function parseCommand(argv: string[]): Command {
	if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
		return { type: "help" };
	}

	const [first, ...rest] = argv;

	if (first === "caption") {
		return { type: "caption", args: parseArgs(rest) };
	}
	if (first === "edit") {
		return { type: "edit", args: parseEditArgs(rest) };
	}
	if (first === "serve") {
		return { type: "serve", args: parseServeArgs(rest) };
	}
	if (first === "slice") {
		return { type: "slice", args: parseSliceArgs(rest) };
	}
	if (first === "plan") {
		return { type: "plan", args: parsePlanArgs(rest) };
	}

	// Back-compat: not a known subcommand → treat the whole argv as caption args.
	return { type: "caption", args: parseArgs(argv) };
}

async function runCaption(args: ParsedArgs): Promise<void> {
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

async function runEdit(args: EditArgs): Promise<void> {
	const raw = JSON.parse(fs.readFileSync(args.projectPath, "utf8"));
	const project = validateProject(raw);

	// Auto-generate any motionClip assets that reference a template (Task #3).
	await generateMotionClips(project);

	const ext = path.extname(args.projectPath);
	const outputPath =
		args.output ?? `${args.projectPath.slice(0, -ext.length || undefined)}.mp4`;

	console.log(`Rendering project ${project.title} to ${outputPath}...`);

	await renderProject({
		project,
		outputPath,
		onProgress: (stage: string, progress: number) => {
			process.stdout.write(`\r${stage}: ${Math.round(progress * 100)}%`);
		},
	});

	console.log(`\nDone! Output: ${outputPath}`);
}

/**
 * Best-effort generation of motionClip assets via the Hyperframes pipeline
 * (Task #3). A motionClip references its rendered mp4 by `src`; if that file is
 * missing on disk and the item carries a `template` (or `src`'s base name
 * matches a Hyperframes template), it is rendered — injecting the item's
 * `props` — and written to the item's `src` location so the Timeline can load
 * it via staticFile. Items whose mp4 already exists, or that resolve to no
 * known template, are left untouched.
 */
async function generateMotionClips(project: Project): Promise<void> {
	const clips = project.tracks
		.flatMap((track) => track.items)
		.filter((item) => item.kind === "motionClip");
	if (clips.length === 0) {
		return;
	}

	const publicDir = path.resolve(process.cwd(), "public");

	for (const clip of clips) {
		const srcPath = path.isAbsolute(clip.src)
			? clip.src
			: path.join(publicDir, clip.src);
		if (fs.existsSync(srcPath)) {
			continue;
		}

		// Prefer an explicit template; otherwise infer from the src base name.
		const template =
			clip.template ?? path.basename(clip.src).replace(/\.mp4$/, "");
		if (!fs.existsSync(resolveTemplatePath(template))) {
			console.warn(
				`motionClip "${clip.id}": no asset at ${clip.src} and no template "${template}" — skipping.`,
			);
			continue;
		}

		console.log(
			`Generating motionClip "${clip.id}" from template ${template}...`,
		);
		const outDir = path.dirname(srcPath);
		const produced = await renderMotionClip({
			template,
			props: clip.props ?? {},
			durationInFrames: clip.durationInFrames,
			fps: project.fps,
			width: project.width,
			height: project.height,
			outDir,
		});
		// renderMotionClip names the file after the template; move it to `src`.
		if (path.resolve(produced) !== path.resolve(srcPath)) {
			fs.mkdirSync(path.dirname(srcPath), { recursive: true });
			fs.renameSync(produced, srcPath);
		}
	}
}

async function runSlice(args: SliceArgs): Promise<void> {
	console.log(`Slicing storyboard project ${args.projectDir}...`);
	const manifest = await sliceProject(args.projectDir);
	const clips = manifest.scenes.reduce((n, s) => n + s.variants.length, 0);
	const out = path.join(args.projectDir, "scenes", "scenes.json");
	console.log(
		`\nDone! ${manifest.scenes.length} scenes, ${clips} clips → ${out}`,
	);
}

async function runPlan(args: PlanArgs): Promise<void> {
	const scenesDir = path.join(args.projectDir, "scenes");

	if (args.mode === "compare") {
		console.log(`Planning A/B compare timeline for ${args.projectDir}...`);
		const plan = buildComparePlan(args.projectDir);
		const out = path.join(scenesDir, "palmier-compare-plan.json");
		fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
		const clips = plan.slots.reduce((n, s) => n + s.variants.length, 0);
		console.log(
			`\nDone! ${plan.slots.length} slots, ${clips} variant clips ` +
				`(A/B parallel tracks) → ${out}`,
		);
		return;
	}

	if (args.mode === "final") {
		console.log(
			`Planning final single-track timeline for ${args.projectDir}...`,
		);
		const selection = JSON.parse(
			fs.readFileSync(args.selection as string, "utf8"),
		) as Selection;
		const plan = buildFinalPlan(args.projectDir, selection);
		const out = path.join(scenesDir, "palmier-final-plan.json");
		fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);
		const order = plan.clips
			.map((c) => `${c.block}${c.variant}${c.scene}`)
			.join(" ");
		console.log(
			`\nDone! ${plan.clips.length} winner clips (single track) → ${out}`,
		);
		console.log(`Order: ${order}`);
		return;
	}

	// concat (default) — unchanged v1 behavior.
	console.log(`Planning palmier timeline for ${args.projectDir}...`);
	const plan = buildPalmierPlan(args.projectDir);
	const out = path.join(args.projectDir, "scenes", "palmier-plan.json");
	fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`);

	const order = plan.clips
		.map((c) => `${c.block}${c.variant}${c.scene}`)
		.join(" ");
	console.log(
		`\nDone! ${plan.clips.length} clips (Block→variant→scene) → ${out}`,
	);
	console.log(`Order: ${order}`);
}

async function runServe(args: ServeArgs): Promise<void> {
	// Loaded via a variable specifier so the CLI typechecks before the editor
	// server module (Task #5) exists.
	const moduleSpecifier = "./server/index";
	let mod: Record<string, unknown>;
	try {
		mod = (await import(moduleSpecifier)) as Record<string, unknown>;
	} catch {
		console.error(
			"Editor not built yet — the server module is not available. Try again once `src/server/index.ts` is in place.",
		);
		process.exit(1);
	}

	const startServer = mod.startServer;
	if (typeof startServer !== "function") {
		console.error("Editor not built yet — `startServer` is not exported.");
		process.exit(1);
	}

	await (
		startServer as (opts: {
			port: number;
			projectPath?: string;
		}) => Promise<void> | void
	)({
		port: args.port,
		projectPath: args.projectPath,
	});
}

async function main(): Promise<void> {
	const command = parseCommand(process.argv.slice(2));

	switch (command.type) {
		case "help":
			console.log(HELP_TEXT);
			return;
		case "caption":
			await runCaption(command.args);
			return;
		case "edit":
			await runEdit(command.args);
			return;
		case "serve":
			await runServe(command.args);
			return;
		case "slice":
			await runSlice(command.args);
			return;
		case "plan":
			await runPlan(command.args);
			return;
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
