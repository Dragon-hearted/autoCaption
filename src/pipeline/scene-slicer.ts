import { spawn } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

/**
 * Scene slicer: chop Seedance-generated storyboard block videos into per-scene
 * clips the browser editor can pick from.
 *
 * Pipeline (mirrors src/pipeline/motion-graphics.ts's spawn-with-timeout +
 * mkdtemp staging shape, and src/transcribe.ts's ffmpeg shell-out style):
 *   discover blockN-{gen}.mp4  ->  ffmpeg scene filter (over-generate candidate
 *   cuts)  ->  per-gen `claude -p` vision arbiter classifies each boundary
 *   cut|camera_move|fade and REJECTS camera_move (a full zoom/pan collapses to
 *   ONE scene)  ->  ffmpeg re-encode (frame-accurate) span cuts keeping audio
 *   ->  continuous global scene numbering across blocks  ->  poster jpg per clip
 *   ->  a single scenes.json, all written into <project>/scenes/.
 *
 * The frame-extraction technique is lifted from
 * .agents/skills/claude-video/scripts/frames.py (fast `-ss` seek, scale to 512,
 * `-q:v` jpeg) rather than shelling out to python — keeps the pipeline to
 * ffmpeg + claude with no extra language runtime.
 *
 * DOCS CAVEAT: the auto-editor knowledge/ docs are stale (caption-era). This
 * module is the source of truth for the slice pipeline.
 */

// ── Tunables (ponytail ceilings) ────────────────────────────────────────────

// ponytail: a single sensitive scene-filter threshold, deliberately over-
// generating candidates so the vision arbiter (not ffmpeg) makes the final
// call. Lower = more candidates. Tune per-client if cuts are missed/spurious.
const DEFAULT_THRESHOLD = 0.15;
// ponytail: fixed minimum scene length — drops candidates hugging a neighbour
// or the clip edge. A real shot shorter than this collapses into its neighbour.
const DEFAULT_MIN_SCENE_SECONDS = 0.5;
// ponytail: fixed bounded pool size for the per-gen (ffmpeg + claude) and
// per-clip (ffmpeg) work. Env override: SLICE_CONCURRENCY.
const DEFAULT_CONCURRENCY = 4;
const DEDUPE_SECONDS = 0.3;
const FRAME_DELTA_SECONDS = 0.12; // frames straddling a candidate boundary
const FF_TIMEOUT_MS = 120_000;
const CUT_TIMEOUT_MS = 300_000;
const PROBE_TIMEOUT_MS = 30_000;
const CLAUDE_TIMEOUT_MS = 240_000;
const RENDERS_SUBDIR = join("seedance-v2", "renders");

// ── Types ───────────────────────────────────────────────────────────────────

export type BoundaryClass = "cut" | "camera_move" | "fade";

export interface GenRef {
	block: number;
	gen: string;
	path: string;
}

export interface ShotMeta {
	description: string | null;
	beat: string | null;
	camera_move: string | null;
}

export interface Span extends ShotMeta {
	start: number;
	end: number;
	fps: number;
}

export interface GenResult extends GenRef {
	spans: Span[];
}

/**
 * The vision arbiter — a `claude -p` subprocess by default, injectable so the
 * self-check (and any test) can stub it and still exercise the deterministic
 * numbering + manifest logic offline.
 */
export interface Arbiter {
	/** Classify each candidate boundary of one generation; result aligns to `candidates`. */
	classify(
		genPath: string,
		candidates: number[],
		workDir: string,
		label: string,
	): Promise<BoundaryClass[]>;
	/** Describe each surviving span of one generation; result aligns to `spans`. */
	describe(
		genPath: string,
		spans: Array<{ start: number; end: number }>,
		workDir: string,
		label: string,
	): Promise<ShotMeta[]>;
}

export interface SliceOptions {
	arbiter?: Arbiter;
	concurrency?: number;
	threshold?: number;
	minSceneSeconds?: number;
	rendersSubdir?: string;
	claudeModel?: string;
}

export interface ManifestVariant extends ShotMeta {
	variant: string;
	clip: string;
	thumb: string;
	source_video: string;
	start: number;
	end: number;
	fps: number;
}

export interface ManifestScene {
	scene: number;
	block: number;
	beat: string | null;
	variants: ManifestVariant[];
}

export interface Manifest {
	project: string;
	scenes: ManifestScene[];
}

// ── Pure helpers (unit-testable, no IO) ─────────────────────────────────────

const GEN_RE = /^block[ _-]?(\d+)[ _-]([a-z0-9]+)\.mp4$/i;

/** Match a `blockN-{gen}.mp4` filename → {block, gen}, or null. */
export function parseGenName(
	name: string,
): { block: number; gen: string } | null {
	const m = GEN_RE.exec(name);
	if (!m) return null;
	return { block: Number(m[1]), gen: m[2].toLowerCase() };
}

/** Extract candidate boundary timestamps from ffmpeg `showinfo` stderr. */
export function parseCandidateTimes(stderr: string): number[] {
	const times: number[] = [];
	const re = /pts_time:([0-9]+(?:\.[0-9]+)?)/g;
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: standard regex scan
	while ((m = re.exec(stderr)) !== null) {
		times.push(Number(m[1]));
	}
	times.sort((a, b) => a - b);
	// Dedupe near-duplicate detections (ffmpeg often fires on adjacent frames).
	const out: number[] = [];
	for (const t of times) {
		if (out.length === 0 || t - out[out.length - 1] > DEDUPE_SECONDS)
			out.push(t);
	}
	return out;
}

/**
 * Turn verified boundary timestamps into scene spans over [0, duration],
 * dropping boundaries that would make a scene shorter than `minLen`.
 * No boundaries → one span covering the whole clip (the pure-zoom case).
 */
export function boundariesToSpans(
	duration: number,
	boundaries: number[],
	minLen: number = DEFAULT_MIN_SCENE_SECONDS,
): Array<{ start: number; end: number }> {
	const cuts: number[] = [];
	let prev = 0;
	for (const t of [...boundaries].sort((a, b) => a - b)) {
		if (t - prev >= minLen && duration - t >= minLen) {
			cuts.push(t);
			prev = t;
		}
	}
	const points = [0, ...cuts, duration];
	const spans: Array<{ start: number; end: number }> = [];
	for (let i = 0; i < points.length - 1; i++) {
		spans.push({ start: points[i], end: points[i + 1] });
	}
	return spans;
}

/**
 * Group a block's per-generation spans into scenes by ORDINAL shot position.
 *
 * "detected cuts decide count, sheet aligns identity": gen-a's i-th detected
 * shot and gen-b's i-th shot are the SAME scene → they become variants a/b of
 * one scene sharing one global number. Scenes per block = MAX shot count across
 * the block's gens; where a gen ran short, the higher-ordinal scenes just carry
 * fewer variants. `beat` is a display label only — taken from the first
 * available gen (a, else the lowest gen present).
 *
 * ponytail: ordinal-within-block alignment assumes gens detect shots in the
 * same order; it misaligns if a gen inserts or reorders a shot — upgrade path =
 * a vision alignment agent that matches shots across gens by content.
 *
 * (Earlier this grouped by exact vision beat-label string; free-text labels
 * differ per gen — "dancefloor" vs "dance floor" — so nothing matched and every
 * gen's shots became separate single-variant scenes. Ordinal fixes that.)
 */
export function groupBlockScenes(genResults: GenResult[]): Array<{
	beat: string | null;
	variants: Array<{ gen: string; span: Span }>;
}> {
	// Order gens by letter so variants list + beat pick are deterministic (a first).
	const gens = genResults
		.filter((g) => g.spans.length > 0)
		.sort((a, b) => a.gen.localeCompare(b.gen));
	if (gens.length === 0) return [];

	const count = Math.max(...gens.map((g) => g.spans.length));
	const scenes: Array<{
		beat: string | null;
		variants: Array<{ gen: string; span: Span }>;
	}> = [];
	for (let i = 0; i < count; i++) {
		const variants = gens
			.filter((g) => g.spans[i])
			.map((g) => ({ gen: g.gen, span: g.spans[i] }));
		// Display label from the first available gen (a, else lowest present).
		const beat = variants[0]?.span.beat ?? null;
		scenes.push({ beat, variants });
	}
	return scenes;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ── Discovery ───────────────────────────────────────────────────────────────

function collectRefs(entries: Array<{ dir: string; name: string }>): GenRef[] {
	const refs: GenRef[] = [];
	for (const { dir, name } of entries) {
		const parsed = parseGenName(name);
		if (parsed) refs.push({ ...parsed, path: join(dir, name) });
	}
	return refs;
}

/** Recursively collect *.mp4 under `root` (skips VCS/dep dirs, depth-capped). */
function walkMp4(
	root: string,
	depth = 0,
): Array<{ dir: string; name: string }> {
	if (depth > 6) return [];
	const out: Array<{ dir: string; name: string }> = [];
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(root, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		if (e.name.startsWith(".") || e.name === "node_modules") continue;
		if (e.isDirectory()) out.push(...walkMp4(join(root, e.name), depth + 1));
		else if (e.isFile() && e.name.toLowerCase().endsWith(".mp4"))
			out.push({ dir: root, name: e.name });
	}
	return out;
}

/**
 * Discover every `blockN-{gen}.mp4` generation, grouped by block, ordered by
 * gen letter. Primary source is `<project>/seedance-v2/renders/`; if that dir
 * is missing or holds no matching names, fall back to a whole-project glob
 * (naming variants exist across clients).
 */
export function discoverGenerations(
	projectDir: string,
	rendersSubdir: string = RENDERS_SUBDIR,
): GenRef[] {
	const rendersDir = join(projectDir, rendersSubdir);
	let refs: GenRef[] = [];
	if (fs.existsSync(rendersDir)) {
		refs = collectRefs(
			fs.readdirSync(rendersDir).map((name) => ({ dir: rendersDir, name })),
		);
	}
	if (refs.length === 0) {
		// ponytail: glob fallback — walk the whole project for blockN-{gen}.mp4.
		refs = collectRefs(walkMp4(projectDir));
	}
	refs.sort((a, b) => a.block - b.block || a.gen.localeCompare(b.gen));
	return refs;
}

// ── Subprocess plumbing (mirrors motion-graphics.ts timeout guard) ──────────

function spawnCapture(
	cmd: string,
	args: string[],
	timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (d) => {
			stdout += d.toString();
		});
		child.stderr?.on("data", (d) => {
			stderr += d.toString();
		});
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
		}, timeoutMs);
		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolvePromise({ code, stdout, stderr });
		});
	});
}

async function probe(path: string): Promise<{ duration: number; fps: number }> {
	const { stdout } = await spawnCapture(
		"ffprobe",
		[
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=r_frame_rate,duration:format=duration",
			"-of",
			"json",
			path,
		],
		PROBE_TIMEOUT_MS,
	);
	let duration = 0;
	let fps = 30;
	try {
		const j = JSON.parse(stdout || "{}");
		const s = j.streams?.[0] ?? {};
		const fmt = j.format ?? {};
		duration = Number(s.duration ?? fmt.duration ?? 0) || 0;
		const [n, d] = String(s.r_frame_rate ?? "30/1")
			.split("/")
			.map(Number);
		fps = d ? Math.round(n / d) : 30;
	} catch {
		// fall through to defaults
	}
	return { duration, fps };
}

async function detectCandidates(
	path: string,
	threshold: number,
): Promise<number[]> {
	const { stderr } = await spawnCapture(
		"ffmpeg",
		[
			"-hide_banner",
			"-nostdin",
			"-i",
			path,
			"-vf",
			`select='gt(scene,${threshold})',showinfo`,
			"-an",
			"-f",
			"null",
			"-",
		],
		FF_TIMEOUT_MS,
	);
	return parseCandidateTimes(stderr);
}

/** Extract one frame at time `t` (frames.py technique: fast seek + scale 512). */
async function extractFrame(
	path: string,
	t: number,
	out: string,
): Promise<void> {
	const { code, stderr } = await spawnCapture(
		"ffmpeg",
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-ss",
			Math.max(0, t).toFixed(3),
			"-i",
			path,
			"-frames:v",
			"1",
			"-q:v",
			"4",
			"-vf",
			"scale=512:-2",
			out,
		],
		FF_TIMEOUT_MS,
	);
	if (code !== 0)
		throw new Error(
			`ffmpeg frame extract failed (${code}): ${stderr.slice(-300)}`,
		);
}

/**
 * Frame-accurate span cut by RE-ENCODE (not `-c copy`), keeping source audio.
 * `-ss` before `-i` + `-t` gives an accurate seek with modern ffmpeg when the
 * output is re-encoded.
 */
async function cutClip(
	path: string,
	start: number,
	end: number,
	out: string,
): Promise<void> {
	const dur = Math.max(0.04, end - start);
	const { code, stderr } = await spawnCapture(
		"ffmpeg",
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-ss",
			start.toFixed(3),
			"-i",
			path,
			"-t",
			dur.toFixed(3),
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			"18",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-movflags",
			"+faststart",
			out,
		],
		CUT_TIMEOUT_MS,
	);
	if (code !== 0)
		throw new Error(`ffmpeg cut failed (${code}): ${stderr.slice(-400)}`);
}

/** Grab a poster jpg (first frame) from a produced clip. */
async function posterFrame(clip: string, out: string): Promise<void> {
	const { code, stderr } = await spawnCapture(
		"ffmpeg",
		[
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-i",
			clip,
			"-frames:v",
			"1",
			"-q:v",
			"3",
			out,
		],
		FF_TIMEOUT_MS,
	);
	if (code !== 0)
		throw new Error(`ffmpeg poster failed (${code}): ${stderr.slice(-300)}`);
}

// ── Bounded concurrency pool (no dependency) ────────────────────────────────

async function mapPool<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	const workers = Array.from(
		{ length: Math.max(1, Math.min(limit, items.length)) },
		async () => {
			while (true) {
				const i = next++;
				if (i >= items.length) return;
				results[i] = await fn(items[i], i);
			}
		},
	);
	await Promise.all(workers);
	return results;
}

// ── Default arbiter: `claude -p` headless vision ────────────────────────────

function coerceStr(v: unknown): string | null {
	return typeof v === "string" && v.trim() ? v.trim() : null;
}

function parseJsonArray(text: string): unknown[] {
	const m = text.match(/\[[\s\S]*\]/);
	if (!m) return [];
	try {
		const v = JSON.parse(m[0]);
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
}

/**
 * Spawn the headless `claude -p` arbiter.
 *
 * env -u ANTHROPIC_API_KEY: a stray ANTHROPIC_API_KEY makes the subscription-
 * auth `claude` binary 402 with "Credit balance too low" — the documented
 * remedy is to unset it for the subprocess (MEMORY: moodboarder_claude_credit_auth).
 * The `env -u` prefix is exactly that guard.
 *
 * --allowedTools Read + --add-dir <workDir> let it read the extracted frame
 * jpegs unattended (no permission prompt, no --dangerously-skip-permissions).
 */
async function runClaude(
	prompt: string,
	workDir: string,
	model?: string,
): Promise<string> {
	const args = [
		"-u",
		"ANTHROPIC_API_KEY",
		"claude",
		"-p",
		prompt,
		"--allowedTools",
		"Read",
		"--add-dir",
		workDir,
		"--output-format",
		"text",
	];
	if (model) args.push("--model", model);
	const { code, stdout, stderr } = await spawnCapture(
		"env",
		args,
		CLAUDE_TIMEOUT_MS,
	);
	if (code !== 0)
		throw new Error(`claude arbiter failed (${code}): ${stderr.slice(-400)}`);
	return stdout;
}

function claudeArbiter(model?: string): Arbiter {
	return {
		async classify(genPath, candidates, workDir, label) {
			if (candidates.length === 0) return [];
			const lines: string[] = [];
			for (let i = 0; i < candidates.length; i++) {
				const t = candidates[i];
				const before = join(workDir, `c${i}_before.jpg`);
				const after = join(workDir, `c${i}_after.jpg`);
				await extractFrame(genPath, t - FRAME_DELTA_SECONDS, before);
				await extractFrame(genPath, t + FRAME_DELTA_SECONDS, after);
				lines.push(
					`Boundary ${i} @ ${t.toFixed(2)}s: before=${before} after=${after}`,
				);
			}
			const prompt =
				`You are classifying shot boundaries in a rendered storyboard video (${label}).\n` +
				`For each boundary below, Read the two frames straddling it and decide if the ` +
				`change is a hard "cut" (different shot), a continuous "camera_move" (a single ` +
				`shot still zooming/panning/tracking — NOT a new scene), or a "fade" transition.\n\n` +
				`${lines.join("\n")}\n\n` +
				`Output ONLY a JSON array, no prose, no markdown fences, one object per boundary:\n` +
				`[{"i":0,"type":"cut|camera_move|fade"}, ...]`;
			const out = await runClaude(prompt, workDir, model);
			const arr = parseJsonArray(out);
			const result: BoundaryClass[] = new Array(candidates.length).fill("cut");
			for (const o of arr) {
				const rec = o as { i?: unknown; type?: unknown };
				const i = typeof rec.i === "number" ? rec.i : -1;
				const t = rec.type;
				if (
					i >= 0 &&
					i < candidates.length &&
					(t === "cut" || t === "camera_move" || t === "fade")
				)
					result[i] = t;
			}
			return result;
		},
		async describe(genPath, spans, workDir, label) {
			if (spans.length === 0) return [];
			const lines: string[] = [];
			for (let i = 0; i < spans.length; i++) {
				const mid = (spans[i].start + spans[i].end) / 2;
				const f = join(workDir, `s${i}.jpg`);
				await extractFrame(genPath, mid, f);
				lines.push(
					`Shot ${i} (${spans[i].start.toFixed(1)}-${spans[i].end.toFixed(1)}s): ${f}`,
				);
			}
			const prompt =
				`You are labelling detected shots in a storyboard block video (${label}).\n` +
				`For each shot below, Read its frame and give a one-line visual description, a ` +
				`short storyboard-beat guess (or null if unclear), and any camera move within the ` +
				`shot (or null).\n\n${lines.join("\n")}\n\n` +
				`Output ONLY a JSON array, no prose, no markdown fences, one object per shot:\n` +
				`[{"i":0,"description":"...","beat":"..."|null,"camera_move":"..."|null}, ...]`;
			const out = await runClaude(prompt, workDir, model);
			const arr = parseJsonArray(out);
			return spans.map((_, i) => {
				const o = (arr.find((x) => (x as { i?: unknown }).i === i) ??
					{}) as Record<string, unknown>;
				return {
					description: coerceStr(o.description),
					beat: coerceStr(o.beat),
					camera_move: coerceStr(o.camera_move),
				};
			});
		},
	};
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/** Guard: keep a resolved child path inside its parent (path-traversal). */
function assertWithin(parent: string, child: string, what: string): void {
	const rel = relative(parent, child);
	if (rel.startsWith("..") || isAbsolute(rel)) {
		throw new Error(`${what} escapes project dir: ${child}`);
	}
}

async function analyzeGen(
	ref: GenRef,
	arbiter: Arbiter,
	threshold: number,
	minScene: number,
	tmpRoot: string,
): Promise<GenResult> {
	const label = `storyboard${ref.block} gen ${ref.gen}`;
	const workDir = await mkdtemp(join(tmpRoot, `gen-${ref.block}-${ref.gen}-`));
	try {
		const { duration, fps } = await probe(ref.path);
		const candidates = await detectCandidates(ref.path, threshold);
		const classes = await arbiter.classify(
			ref.path,
			candidates,
			workDir,
			label,
		);
		// Reject camera_move so a full zoom/pan collapses to ONE scene; keep cut+fade.
		const boundaries = candidates.filter(
			(_, i) => classes[i] !== "camera_move",
		);
		const rawSpans = boundariesToSpans(duration || 0, boundaries, minScene);
		const metas = await arbiter.describe(ref.path, rawSpans, workDir, label);
		const spans: Span[] = rawSpans.map((s, i) => ({
			start: s.start,
			end: s.end,
			fps,
			description: metas[i]?.description ?? null,
			beat: metas[i]?.beat ?? null,
			camera_move: metas[i]?.camera_move ?? null,
		}));
		return { ...ref, spans };
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
}

/**
 * Slice a storyboard project into per-scene clips + a scenes.json manifest.
 * Idempotent: overwrites <project>/scenes/ on every run.
 */
export async function sliceProject(
	projectDir: string,
	opts: SliceOptions = {},
): Promise<Manifest> {
	const root = resolve(projectDir);
	if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
		throw new Error(`Storyboard project directory not found: ${projectDir}`);
	}

	const arbiter = opts.arbiter ?? claudeArbiter(opts.claudeModel);
	const concurrency =
		opts.concurrency ??
		(Number(process.env.SLICE_CONCURRENCY) || DEFAULT_CONCURRENCY);
	const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
	const minScene = opts.minSceneSeconds ?? DEFAULT_MIN_SCENE_SECONDS;

	const refs = discoverGenerations(root, opts.rendersSubdir ?? RENDERS_SUBDIR);
	if (refs.length === 0) {
		throw new Error(
			`No blockN-{gen}.mp4 generations found under ${projectDir} ` +
				`(looked in ${opts.rendersSubdir ?? RENDERS_SUBDIR} then a whole-project glob).`,
		);
	}

	const tmpRoot = await mkdtemp(join(os.tmpdir(), "auto-editor-slice-"));
	let genResults: GenResult[];
	try {
		genResults = await mapPool(refs, concurrency, (ref) =>
			analyzeGen(ref, arbiter, threshold, minScene, tmpRoot),
		);
	} finally {
		await rm(tmpRoot, { recursive: true, force: true });
	}

	// Group per block, assign continuous global scene numbers across blocks.
	const blocks = [...new Set(genResults.map((g) => g.block))].sort(
		(a, b) => a - b,
	);
	const scenesDir = join(root, "scenes");
	assertWithin(root, scenesDir, "scenes dir");
	await rm(scenesDir, { recursive: true, force: true });
	fs.mkdirSync(scenesDir, { recursive: true });

	interface ClipJob {
		global: number;
		block: number;
		beat: string | null;
		gen: string;
		span: Span;
		srcPath: string;
		base: string;
	}
	const jobs: ClipJob[] = [];
	let globalN = 0;
	for (const block of blocks) {
		const gensOfBlock = genResults
			.filter((g) => g.block === block)
			.sort((a, b) => a.gen.localeCompare(b.gen));
		const byGenPath = new Map(gensOfBlock.map((g) => [g.gen, g.path]));
		for (const scene of groupBlockScenes(gensOfBlock)) {
			globalN += 1;
			for (const v of scene.variants) {
				jobs.push({
					global: globalN,
					block,
					beat: scene.beat,
					gen: v.gen,
					span: v.span,
					srcPath: byGenPath.get(v.gen) as string,
					base: `scene${globalN}_storyboard${block}_${v.gen}`,
				});
			}
		}
	}

	// Cut every clip + poster with the bounded pool.
	await mapPool(jobs, concurrency, async (job) => {
		const clipPath = join(scenesDir, `${job.base}.mp4`);
		const thumbPath = join(scenesDir, `${job.base}.jpg`);
		assertWithin(root, clipPath, "clip");
		assertWithin(root, thumbPath, "thumb");
		await cutClip(job.srcPath, job.span.start, job.span.end, clipPath);
		await posterFrame(clipPath, thumbPath);
	});

	// Assemble the manifest (paths relative to the project dir — the editor contract).
	const sceneMap = new Map<number, ManifestScene>();
	const order: number[] = [];
	for (const job of jobs) {
		let scene = sceneMap.get(job.global);
		if (!scene) {
			scene = {
				scene: job.global,
				block: job.block,
				beat: job.beat,
				variants: [],
			};
			sceneMap.set(job.global, scene);
			order.push(job.global);
		}
		scene.variants.push({
			variant: job.gen,
			clip: join("scenes", `${job.base}.mp4`),
			thumb: join("scenes", `${job.base}.jpg`),
			source_video: relative(root, job.srcPath),
			start: round2(job.span.start),
			end: round2(job.span.end),
			fps: job.span.fps,
			description: job.span.description,
			beat: job.span.beat,
			camera_move: job.span.camera_move,
		});
	}
	const manifest: Manifest = {
		project: basename(root),
		scenes: order.map((n) => sceneMap.get(n) as ManifestScene),
	};

	fs.writeFileSync(
		join(scenesDir, "scenes.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	return manifest;
}

// ── Self-check (no test framework) ──────────────────────────────────────────
// Runs offline: real ffmpeg detection + cut + poster + manifest, STUBBED
// arbiter (no `claude`, no python). Asserts a two-scene block yields 2 clips, a
// pure-zoom block yields exactly 1 clip (camera_move rejected), that cross-gen
// shots MERGE by ordinal into one shared-number scene (block3: gen-a 2 shots +
// gen-b 3 shots → 3 scenes, first two with a+b variants, third with b only),
// and that global scene numbers stay continuous across blocks.
//   bun run src/pipeline/scene-slicer.ts
async function selfCheck(): Promise<void> {
	const tmp = fs.mkdtempSync(join(os.tmpdir(), "slice-selfcheck-"));
	const renders = join(tmp, RENDERS_SUBDIR);
	fs.mkdirSync(renders, { recursive: true });

	const ff = (args: string[]) =>
		spawnCapture(
			"ffmpeg",
			["-hide_banner", "-loglevel", "error", "-y", ...args],
			FF_TIMEOUT_MS,
		);

	// block1-a: two distinct 1s color segments = one hard cut → 2 scenes.
	await ff([
		"-f",
		"lavfi",
		"-i",
		"color=c=red:s=320x240:d=1:r=30",
		"-f",
		"lavfi",
		"-i",
		"color=c=blue:s=320x240:d=1:r=30",
		"-filter_complex",
		"[0:v][1:v]concat=n=2:v=1[v]",
		"-map",
		"[v]",
		"-pix_fmt",
		"yuv420p",
		join(renders, "block1-a.mp4"),
	]);
	// block2-a: single 2s continuous zoom = pure camera move → 1 scene.
	await ff([
		"-f",
		"lavfi",
		"-i",
		"testsrc=s=320x240:d=2:r=30",
		"-vf",
		"zoompan=z='min(zoom+0.004,1.5)':d=1:s=320x240,format=yuv420p",
		join(renders, "block2-a.mp4"),
	]);
	// block3: two gens with different shot counts, to prove ordinal cross-gen
	// merge. gen-a: 2 shots; gen-b: 3. Colors are chosen for HIGH luma contrast
	// (black↔white↔red) — the ffmpeg scene score is luma-driven, so equal-luma
	// pairs like red↔green would not register as a cut.
	const concat = (colors: string[], out: string) =>
		ff([
			...colors.flatMap((c) => [
				"-f",
				"lavfi",
				"-i",
				`color=c=${c}:s=320x240:d=1:r=30`,
			]),
			"-filter_complex",
			`${colors.map((_, i) => `[${i}:v]`).join("")}concat=n=${colors.length}:v=1[v]`,
			"-map",
			"[v]",
			"-pix_fmt",
			"yuv420p",
			out,
		]);
	await concat(["black", "white"], join(renders, "block3-a.mp4"));
	await concat(["black", "white", "red"], join(renders, "block3-b.mp4"));

	// Stub arbiter: block1/block3 boundaries are real cuts; block2 boundaries are
	// all camera_move (rejected). block3 gens carry distinct beat labels so we can
	// prove the merged scene's beat comes from gen a. No `claude`/python runs.
	const stub: Arbiter = {
		async classify(genPath, candidates) {
			const kind: BoundaryClass = genPath.includes("block2")
				? "camera_move"
				: "cut";
			return candidates.map(() => kind);
		},
		async describe(genPath, spans) {
			const cam = genPath.includes("block2") ? "continuous zoom" : null;
			let beat: string | null = null;
			if (genPath.includes("block3"))
				beat = genPath.includes("-a.mp4") ? "beatA" : "beatB";
			return spans.map(() => ({
				description: "stub shot",
				beat,
				camera_move: cam,
			}));
		},
	};

	const manifest = await sliceProject(tmp, { arbiter: stub, concurrency: 2 });

	const scenesDir = join(tmp, "scenes");
	const clips = fs.readdirSync(scenesDir).filter((f) => f.endsWith(".mp4"));
	const block1 = clips.filter((f) => f.includes("storyboard1")).sort();
	const block2 = clips.filter((f) => f.includes("storyboard2")).sort();
	const block3 = clips.filter((f) => f.includes("storyboard3")).sort();
	const globals = manifest.scenes.map((s) => s.scene);
	const byNum = (n: number) => manifest.scenes.find((s) => s.scene === n);
	const variantLetters = (n: number) =>
		(byNum(n)?.variants.map((v) => v.variant) ?? []).sort().join("");
	// block3 (global scenes 4,5,6): gen-a=2 shots, gen-b=3 shots → 3 scenes.
	const s4 = byNum(4);
	const s5 = byNum(5);
	const s6 = byNum(6);

	const checks: Array<[string, boolean]> = [
		["block1 (two-scene) → 2 clips", block1.length === 2],
		[
			"block1 clips named scene1/scene2_storyboard1_a",
			block1.join(",") === "scene1_storyboard1_a.mp4,scene2_storyboard1_a.mp4",
		],
		["block2 (pure-zoom) → exactly 1 clip", block2.length === 1],
		[
			"block2 clip is scene3 (continuous numbering across blocks)",
			block2[0] === "scene3_storyboard2_a.mp4",
		],
		[
			"block3 → 3 ordinal scenes (max shot count 2 vs 3)",
			manifest.scenes.filter((s) => s.block === 3).length === 3,
		],
		[
			"block3 scenes 4 & 5 each merge variants a+b",
			variantLetters(4) === "ab" && variantLetters(5) === "ab",
		],
		[
			"block3 scene 6 has variant b only (gen-a ran short)",
			variantLetters(6) === "b",
		],
		[
			"cross-gen shot-1 shares global number + filename stem (scene4_storyboard3_{a,b})",
			block3.includes("scene4_storyboard3_a.mp4") &&
				block3.includes("scene4_storyboard3_b.mp4") &&
				s4?.variants.every((v) => v.clip.includes("scene4_storyboard3_")) ===
					true,
		],
		[
			"merged-scene beat taken from first gen (a → beatA); short scene from b → beatB",
			s4?.beat === "beatA" && s6?.beat === "beatB" && s5?.beat === "beatA",
		],
		[
			"global scene numbers continuous 1..6",
			JSON.stringify(globals) === "[1,2,3,4,5,6]",
		],
		[
			"every clip has a poster jpg",
			clips.every((c) =>
				fs.existsSync(join(scenesDir, c.replace(/\.mp4$/, ".jpg"))),
			),
		],
		[
			"scenes.json parses and lists the manifest",
			fs.existsSync(join(scenesDir, "scenes.json")) &&
				JSON.parse(fs.readFileSync(join(scenesDir, "scenes.json"), "utf8"))
					.scenes.length === 6,
		],
	];

	let ok = true;
	for (const [name, pass] of checks) {
		console.log(`${pass ? "✓" : "✗"} ${name}`);
		if (!pass) ok = false;
	}
	fs.rmSync(tmp, { recursive: true, force: true });
	if (!ok) {
		console.error("scene-slicer self-check FAILED");
		process.exit(1);
	}
	console.log("scene-slicer self-check passed");
}

if (import.meta.main) {
	selfCheck().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
