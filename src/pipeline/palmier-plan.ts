import fs from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";
import type { Manifest, ManifestScene, ManifestVariant } from "./scene-slicer";

/**
 * Palmier plan: turn a slicer `scenes.json` manifest into a deterministic,
 * flat clip timeline for the palmier-pro editor.
 *
 * This is the pure, testable ORDERING core (Layer 1). It does no MCP calls and
 * touches no video files — it only reads `scenes.json` and emits an ordered
 * `PalmierPlan`. The `/palmier-edit` skill (Layer 3) drives palmier from this.
 *
 * Ordering is exactly: Block ascending → variant letter ascending (a, b, …) →
 * scene ascending. One sequential track. So for block 1 we emit every scene of
 * variant `a` in scene order, then every scene of variant `b` in scene order,
 * then move on to block 2, etc.
 *
 * A scene missing a given variant (the slicer's short-gen tolerance) is simply
 * skipped in that variant's run — it does NOT shift or renumber the other clips.
 *
 * Clips are already frame-accurately trimmed by the slicer, so timeline
 * placement is pure append: each clip's `fromFrame` = cumulative sum of all
 * prior clips' `durationInFrames` (starts at 0, contiguous, monotonic).
 *
 *   bun run src/pipeline/palmier-plan.ts        # offline self-check
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface PalmierClip {
	/** Absolute, on-disk source path (variant.clip resolved against projectDir). */
	src: string;
	scene: number;
	block: number;
	variant: string;
	beat: string | null;
	description: string | null;
	start: number;
	end: number;
	fps: number;
	/** Math.round((end - start) * fps). */
	durationInFrames: number;
	/** Cumulative sum of all prior clips' durationInFrames (0-based, contiguous). */
	fromFrame: number;
}

export interface PalmierPlan {
	project: string;
	fps: number;
	clips: PalmierClip[];
}

/** One variant placed on its own lane inside a scene's shared compare slot. */
export interface CompareVariant {
	/** Absolute, on-disk source path (variant.clip resolved against projectDir). */
	src: string;
	variant: string;
	/** Track index by variant-letter order (a→0, b→1, …), shared across scenes. */
	lane: number;
	/** Math.round((end - start) * fps). */
	durationInFrames: number;
	description: string | null;
	beat: string | null;
}

/**
 * One scene's A/B comparison slot: every variant shares `slotFromFrame` (so they
 * stack vertically, aligned), and the slot is `slotDurationInFrames` = the max
 * variant duration wide, so the next scene's slot never overlaps the tallest lane.
 */
export interface CompareSlot {
	scene: number;
	block: number;
	/** Cumulative sum of prior slots' slotDurationInFrames (0-based, contiguous). */
	slotFromFrame: number;
	/** max over variants of durationInFrames. */
	slotDurationInFrames: number;
	variants: CompareVariant[];
}

export interface ComparePlan {
	project: string;
	fps: number;
	slots: CompareSlot[];
}

/** Per-scene winners: `{ "<sceneNumber>": ["a"] | ["a","b"] }`. */
export type Selection = Record<string, string[]>;

// ── Pure ordering core ──────────────────────────────────────────────────────

/** All variant letters present across a block's scenes, sorted alphabetically. */
function variantsOfBlock(scenes: ManifestScene[]): string[] {
	const set = new Set<string>();
	for (const scene of scenes) {
		for (const v of scene.variants) set.add(v.variant);
	}
	return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Build the ordered PalmierPlan from an in-memory manifest.
 *
 * `projectDir` is the manifest's on-disk home — each `variant.clip` (a
 * project-relative path like `scenes/scene1_storyboard1_a.mp4`) is resolved
 * against it to an absolute `src`.
 */
export function planFromManifest(
	manifest: Manifest,
	projectDir: string,
): PalmierPlan {
	const root = resolve(projectDir);

	// Group scenes by block, blocks ascending, scenes ascending within a block.
	const blocks = [...new Set(manifest.scenes.map((s) => s.block))].sort(
		(a, b) => a - b,
	);

	const clips: PalmierClip[] = [];
	let cursor = 0; // running frame offset
	let planFps = 0;

	for (const block of blocks) {
		const blockScenes = manifest.scenes
			.filter((s) => s.block === block)
			.sort((a, b) => a.scene - b.scene);
		const variants = variantsOfBlock(blockScenes);

		for (const variant of variants) {
			for (const scene of blockScenes) {
				const v = scene.variants.find((x) => x.variant === variant);
				if (!v) continue; // scene missing this variant → skip, do not shift others
				const durationInFrames = Math.round((v.end - v.start) * v.fps);
				if (!planFps) planFps = v.fps;
				clips.push({
					src: resolve(root, v.clip),
					scene: scene.scene,
					block,
					variant,
					beat: v.beat ?? scene.beat ?? null,
					description: v.description ?? null,
					start: v.start,
					end: v.end,
					fps: v.fps,
					durationInFrames,
					fromFrame: cursor,
				});
				cursor += durationInFrames;
			}
		}
	}

	return { project: manifest.project, fps: planFps || 30, clips };
}

/** Load `<projectDir>/scenes/scenes.json` into an in-memory Manifest. */
function loadManifest(projectDir: string): Manifest {
	const manifestPath = join(projectDir, "scenes", "scenes.json");
	if (!fs.existsSync(manifestPath)) {
		throw new Error(
			`No scenes.json at ${manifestPath} — run \`auto-editor slice ${projectDir}\` first.`,
		);
	}
	return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;
}

/** Load `<projectDir>/scenes/scenes.json` and build its PalmierPlan. */
export function buildPalmierPlan(projectDir: string): PalmierPlan {
	return planFromManifest(loadManifest(projectDir), projectDir);
}

// ── A/B compare core (parallel-track layout) ────────────────────────────────

/** Scenes in canonical order: Block ascending → scene ascending. */
function scenesInOrder(manifest: Manifest): ManifestScene[] {
	return [...manifest.scenes].sort(
		(a, b) => a.block - b.block || a.scene - b.scene,
	);
}

/**
 * Map every variant letter present anywhere in the manifest to a lane index by
 * sorted letter order (a→0, b→1, …). A global map (not per-scene) keeps lane `b`
 * on the SAME track across scenes even where a scene carries only its `b` gen —
 * so the parallel tracks stay aligned for side-by-side comparison.
 */
function laneMap(manifest: Manifest): Map<string, number> {
	const letters = new Set<string>();
	for (const scene of manifest.scenes) {
		for (const v of scene.variants) letters.add(v.variant);
	}
	const sorted = [...letters].sort((a, b) => a.localeCompare(b));
	return new Map(sorted.map((letter, i) => [letter, i]));
}

/**
 * Build the A/B ComparePlan from an in-memory manifest.
 *
 * For each scene (Block→scene) reserve a time slot whose width = the MAX
 * `durationInFrames` across its variants, and place every variant at the slot's
 * `slotFromFrame` on its own `lane`. Because all variants of a scene share one
 * `slotFromFrame`, the user can solo/mute lanes to compare a vs b in place; the
 * max-width slot guarantees the next scene never overlaps the tallest lane.
 */
export function compareFromManifest(
	manifest: Manifest,
	projectDir: string,
): ComparePlan {
	const root = resolve(projectDir);
	const lanes = laneMap(manifest);

	const slots: CompareSlot[] = [];
	let cursor = 0; // running frame offset
	let planFps = 0;

	for (const scene of scenesInOrder(manifest)) {
		if (scene.variants.length === 0) continue;
		const variants: CompareVariant[] = [...scene.variants]
			.sort((a, b) => a.variant.localeCompare(b.variant))
			.map((v) => {
				if (!planFps) planFps = v.fps;
				return {
					src: resolve(root, v.clip),
					variant: v.variant,
					lane: lanes.get(v.variant) ?? 0,
					durationInFrames: Math.round((v.end - v.start) * v.fps),
					description: v.description ?? null,
					beat: v.beat ?? scene.beat ?? null,
				};
			});
		const slotDurationInFrames = Math.max(
			...variants.map((v) => v.durationInFrames),
		);
		slots.push({
			scene: scene.scene,
			block: scene.block,
			slotFromFrame: cursor,
			slotDurationInFrames,
			variants,
		});
		cursor += slotDurationInFrames;
	}

	return { project: manifest.project, fps: planFps || 30, slots };
}

/** Load `scenes.json` and build its A/B ComparePlan. */
export function buildComparePlan(projectDir: string): ComparePlan {
	return compareFromManifest(loadManifest(projectDir), projectDir);
}

// ── Final single-track core (one winner per scene, contiguous) ──────────────

/**
 * Build the final single-track PalmierPlan from an in-memory manifest + a
 * per-scene `selection`. Emits the SAME flat shape as `planFromManifest`,
 * ordered Block→scene→variant-letter, including ONLY the selected variant(s),
 * with cumulative contiguous `fromFrame` (losers are simply never emitted, so
 * gaps close by construction).
 *
 * A scene absent from `selection` defaults to its sole variant when it has
 * exactly one; a scene with ≥2 variants that was NOT chosen is an error (the
 * user must pick a winner). A selected letter that the scene lacks is an error.
 */
export function finalFromManifest(
	manifest: Manifest,
	projectDir: string,
	selection: Selection,
): PalmierPlan {
	const root = resolve(projectDir);

	const clips: PalmierClip[] = [];
	let cursor = 0;
	let planFps = 0;

	for (const scene of scenesInOrder(manifest)) {
		const available = new Map(scene.variants.map((v) => [v.variant, v]));
		const key = String(scene.scene);

		let chosen: string[];
		if (Object.hasOwn(selection, key)) {
			chosen = selection[key];
			if (!Array.isArray(chosen) || chosen.length === 0) {
				throw new Error(
					`Selection for scene ${scene.scene} is empty — pick at least one variant.`,
				);
			}
		} else if (scene.variants.length === 1) {
			chosen = [scene.variants[0].variant]; // sole variant → auto-keep
		} else {
			throw new Error(
				`Scene ${scene.scene} has ${scene.variants.length} variants ` +
					`(${[...available.keys()].sort().join(", ")}) and must be chosen in the selection.`,
			);
		}

		// variant-letter ascending → "keep both" lands a before b, adjacent.
		for (const letter of [...chosen].sort((a, b) => a.localeCompare(b))) {
			const v = available.get(letter);
			if (!v) {
				throw new Error(
					`Scene ${scene.scene} has no variant "${letter}" ` +
						`(available: ${[...available.keys()].sort().join(", ")}).`,
				);
			}
			const durationInFrames = Math.round((v.end - v.start) * v.fps);
			if (!planFps) planFps = v.fps;
			clips.push({
				src: resolve(root, v.clip),
				scene: scene.scene,
				block: scene.block,
				variant: v.variant,
				beat: v.beat ?? scene.beat ?? null,
				description: v.description ?? null,
				start: v.start,
				end: v.end,
				fps: v.fps,
				durationInFrames,
				fromFrame: cursor,
			});
			cursor += durationInFrames;
		}
	}

	return { project: manifest.project, fps: planFps || 30, clips };
}

/** Load `scenes.json` and build its final single-track PalmierPlan. */
export function buildFinalPlan(
	projectDir: string,
	selection: Selection,
): PalmierPlan {
	return finalFromManifest(loadManifest(projectDir), projectDir, selection);
}

// ── Self-check (no test framework) ──────────────────────────────────────────
// Runs fully offline: writes a SYNTHETIC multi-block, multi-variant scenes.json
// into an OS tmp dir (no real videos — the core never stats files), builds the
// plan, and asserts ordering + frame math. Mirrors scene-slicer.ts's self-check.
//   bun run src/pipeline/palmier-plan.ts
function selfCheck(): void {
	const tmp = fs.mkdtempSync(join(os.tmpdir(), "palmier-plan-selfcheck-"));
	const scenesDir = join(tmp, "scenes");
	fs.mkdirSync(scenesDir, { recursive: true });

	const mkVariant = (
		scene: number,
		block: number,
		variant: string,
		start: number,
		end: number,
	): ManifestVariant => ({
		variant,
		clip: `scenes/scene${scene}_storyboard${block}_${variant}.mp4`,
		thumb: `scenes/scene${scene}_storyboard${block}_${variant}.jpg`,
		source_video: `renders/block${block}-${variant}.mp4`,
		start,
		end,
		fps: 30,
		description: `s${scene}${variant}`,
		beat: `beat${scene}`,
		camera_move: null,
	});

	// block 1: scenes 1,2 — both have variants a AND b.
	// block 2: scenes 3,4,5 — a on all three; b MISSING on scene 4 (short gen).
	const manifest: Manifest = {
		project: "synthetic",
		scenes: [
			{
				scene: 1,
				block: 1,
				beat: "beat1",
				variants: [mkVariant(1, 1, "a", 0, 1), mkVariant(1, 1, "b", 0, 2)],
			},
			{
				scene: 2,
				block: 1,
				beat: "beat2",
				variants: [mkVariant(2, 1, "a", 1, 2), mkVariant(2, 1, "b", 2, 3)],
			},
			{
				scene: 3,
				block: 2,
				beat: "beat3",
				variants: [mkVariant(3, 2, "a", 0, 1), mkVariant(3, 2, "b", 0, 1)],
			},
			{
				scene: 4,
				block: 2,
				beat: "beat4",
				// deliberately NO variant b here
				variants: [mkVariant(4, 2, "a", 1, 3)],
			},
			{
				scene: 5,
				block: 2,
				beat: "beat5",
				variants: [mkVariant(5, 2, "a", 3, 4), mkVariant(5, 2, "b", 1, 2)],
			},
		],
	};
	fs.writeFileSync(
		join(scenesDir, "scenes.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);

	const plan = buildPalmierPlan(tmp);

	// Expected order — Block → variant → scene:
	//   b1 a: s1, s2 | b1 b: s1, s2 | b2 a: s3, s4, s5 | b2 b: s3, s5 (s4 skipped)
	const order = plan.clips.map((c) => `${c.block}${c.variant}${c.scene}`);
	const expectedOrder = [
		"1a1",
		"1a2",
		"1b1",
		"1b2",
		"2a3",
		"2a4",
		"2a5",
		"2b3",
		"2b5",
	];

	const checks: Array<[string, boolean]> = [];

	checks.push([
		`order is exactly Block→variant→scene (${order.join(",")})`,
		JSON.stringify(order) === JSON.stringify(expectedOrder),
	]);

	// fromFrame is monotonic + contiguous: each = prev.fromFrame + prev.duration.
	let contiguous = plan.clips.length > 0 && plan.clips[0].fromFrame === 0;
	for (let i = 1; i < plan.clips.length; i++) {
		const prev = plan.clips[i - 1];
		if (plan.clips[i].fromFrame !== prev.fromFrame + prev.durationInFrames) {
			contiguous = false;
			break;
		}
	}
	checks.push(["fromFrame is monotonic + contiguous (0-based)", contiguous]);

	// durationInFrames = round((end-start)*fps). scene1 b spans 0..2 @30 = 60.
	const s1b = plan.clips.find(
		(c) => c.block === 1 && c.variant === "b" && c.scene === 1,
	);
	checks.push([
		"durationInFrames = round((end-start)*fps)",
		s1b?.durationInFrames === 60,
	]);

	// scene 4 has NO variant b — it must appear in the a-run but be absent in b-run,
	// and its absence must not shift the identity of the other b clips.
	const bRun = plan.clips.filter((c) => c.block === 2 && c.variant === "b");
	checks.push([
		"scene missing variant b is skipped in b-run (only s3, s5 present)",
		bRun.length === 2 && bRun[0].scene === 3 && bRun[1].scene === 5,
	]);
	checks.push([
		"scene 4 IS present in the a-run (not dropped globally)",
		plan.clips.some((c) => c.block === 2 && c.variant === "a" && c.scene === 4),
	]);

	// src paths are absolute + resolve under the project dir.
	checks.push([
		"src paths are absolute",
		plan.clips.every((c) => c.src.startsWith(resolve(tmp))),
	]);

	// ── compare (A/B parallel-track) geometry ────────────────────────────────
	const compare = buildComparePlan(tmp);

	// Slots follow Block→scene order: 1,2 (block1) then 3,4,5 (block2).
	checks.push([
		"compare slots ordered Block→scene (1,2,3,4,5)",
		JSON.stringify(compare.slots.map((s) => s.scene)) ===
			JSON.stringify([1, 2, 3, 4, 5]),
	]);

	// Every scene's slot width = MAX variant duration. @30fps:
	//   s1: max(30,60)=60  s2: max(30,30)=30  s3: max(30,30)=30
	//   s4: 60 (only a)     s5: max(30,30)=30
	const slotBy = (n: number) => compare.slots.find((s) => s.scene === n);
	checks.push([
		"compare slot width = max variant duration (s1=60, s4=60, s2=30)",
		slotBy(1)?.slotDurationInFrames === 60 &&
			slotBy(4)?.slotDurationInFrames === 60 &&
			slotBy(2)?.slotDurationInFrames === 30,
	]);

	// slotFromFrame is contiguous: each = prev.slotFromFrame + prev.width, first 0.
	let slotsContiguous =
		compare.slots.length > 0 && compare.slots[0].slotFromFrame === 0;
	for (let i = 1; i < compare.slots.length; i++) {
		const prev = compare.slots[i - 1];
		if (
			compare.slots[i].slotFromFrame !==
			prev.slotFromFrame + prev.slotDurationInFrames
		) {
			slotsContiguous = false;
			break;
		}
	}
	checks.push(["compare slots are contiguous (0-based)", slotsContiguous]);

	// Every variant of a scene shares the ONE slotFromFrame (they stack aligned).
	// (Trivially true by construction — variants carry no own fromFrame — so we
	// assert the observable proxy: lanes are distinct per scene and letter-mapped.)
	checks.push([
		"compare lanes assigned by variant letter (a→0, b→1)",
		slotBy(1)?.variants.find((v) => v.variant === "a")?.lane === 0 &&
			slotBy(1)?.variants.find((v) => v.variant === "b")?.lane === 1 &&
			// scene 4 has only variant a → still lane 0 (global letter map)
			slotBy(4)?.variants[0]?.lane === 0,
	]);

	// ── final (single-track winners) contiguity + order ──────────────────────
	// In THIS synthetic manifest only scene 4 is single-variant; 1,2,3,5 are a+b.
	// choose a,a,b for 1,2,3 · s4 auto-keeps a · keep both a+b for s5.
	// Expected order 1a1,1a2,2b3,2a4,2a5,2b5.
	const finalSel: Selection = {
		"1": ["a"],
		"2": ["a"],
		"3": ["b"],
		"5": ["a", "b"],
	};
	const final = buildFinalPlan(tmp, finalSel);
	const finalOrder = final.clips.map((c) => `${c.block}${c.variant}${c.scene}`);
	checks.push([
		`final order Block→scene→variant (${finalOrder.join(",")})`,
		JSON.stringify(finalOrder) ===
			JSON.stringify(["1a1", "1a2", "2b3", "2a4", "2a5", "2b5"]),
	]);

	let finalContiguous =
		final.clips.length > 0 && final.clips[0].fromFrame === 0;
	for (let i = 1; i < final.clips.length; i++) {
		const prev = final.clips[i - 1];
		if (final.clips[i].fromFrame !== prev.fromFrame + prev.durationInFrames) {
			finalContiguous = false;
			break;
		}
	}
	checks.push([
		"final fromFrame is contiguous (gaps closed by construction)",
		finalContiguous,
	]);

	// "keep both" for scene 5 → a then b, adjacent, a before b.
	const s5clips = final.clips.filter((c) => c.scene === 5);
	checks.push([
		'"keep both" keeps s5 a+b adjacent, a before b',
		s5clips.length === 2 &&
			s5clips[0].variant === "a" &&
			s5clips[1].variant === "b" &&
			s5clips[1].fromFrame ===
				s5clips[0].fromFrame + s5clips[0].durationInFrames,
	]);

	// An unselected multi-variant scene is a hard error (must be chosen).
	let threwOnUnselected = false;
	try {
		buildFinalPlan(tmp, { "2": ["a"], "3": ["b"], "5": ["a"] }); // scene 1 unchosen
	} catch {
		threwOnUnselected = true;
	}
	checks.push([
		"final throws when a multi-variant scene is unselected",
		threwOnUnselected,
	]);

	let ok = true;
	for (const [name, pass] of checks) {
		console.log(`${pass ? "✓" : "✗"} ${name}`);
		if (!pass) ok = false;
	}
	fs.rmSync(tmp, { recursive: true, force: true });
	if (!ok) {
		console.error("palmier-plan self-check FAILED");
		process.exit(1);
	}
	console.log("palmier-plan self-check passed");
}

if (import.meta.main) {
	selfCheck();
}
