import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildComparePlan,
	buildFinalPlan,
	buildPalmierPlan,
	compareFromManifest,
	finalFromManifest,
	planFromManifest,
	type Selection,
} from "../src/pipeline/palmier-plan";
import type { Manifest, ManifestVariant } from "../src/pipeline/scene-slicer";
import { createTempDir } from "./setup";

function mkVariant(
	scene: number,
	block: number,
	variant: string,
	start: number,
	end: number,
): ManifestVariant {
	return {
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
	};
}

// block 1: scenes 1,2 both have variants a+b.
// block 2: scenes 3,4,5 with a on all three; b missing on scene 4 (short gen).
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

describe("planFromManifest", () => {
	it("orders clips Block → variant → scene", () => {
		const plan = planFromManifest(manifest, "/tmp/whatever");
		const order = plan.clips.map((c) => `${c.block}${c.variant}${c.scene}`);
		expect(order).toEqual([
			"1a1",
			"1a2",
			"1b1",
			"1b2",
			"2a3",
			"2a4",
			"2a5",
			"2b3",
			"2b5",
		]);
	});

	it("emits contiguous, monotonic 0-based fromFrame offsets", () => {
		const plan = planFromManifest(manifest, "/tmp/whatever");
		expect(plan.clips[0].fromFrame).toBe(0);
		for (let i = 1; i < plan.clips.length; i++) {
			const prev = plan.clips[i - 1];
			expect(plan.clips[i].fromFrame).toBe(
				prev.fromFrame + prev.durationInFrames,
			);
		}
	});

	it("computes durationInFrames = round((end - start) * fps)", () => {
		const plan = planFromManifest(manifest, "/tmp/whatever");
		const s1b = plan.clips.find(
			(c) => c.block === 1 && c.variant === "b" && c.scene === 1,
		);
		expect(s1b?.durationInFrames).toBe(60); // (2 - 0) * 30
	});

	it("skips a scene missing a variant without shifting the others", () => {
		const plan = planFromManifest(manifest, "/tmp/whatever");
		const bRun = plan.clips.filter((c) => c.block === 2 && c.variant === "b");
		expect(bRun.map((c) => c.scene)).toEqual([3, 5]); // scene 4 skipped in b-run
		// but scene 4 is still present in the a-run
		expect(
			plan.clips.some(
				(c) => c.block === 2 && c.variant === "a" && c.scene === 4,
			),
		).toBe(true);
	});

	it("resolves src to an absolute path under the project dir", () => {
		const dir = "/tmp/proj";
		const plan = planFromManifest(manifest, dir);
		expect(plan.clips[0].src).toBe(
			resolve(dir, "scenes/scene1_storyboard1_a.mp4"),
		);
	});
});

describe("buildPalmierPlan", () => {
	let tempDir: { path: string; cleanup: () => void };

	beforeEach(() => {
		tempDir = createTempDir();
		const scenesDir = join(tempDir.path, "scenes");
		mkdirSync(scenesDir, { recursive: true });
		writeFileSync(
			join(scenesDir, "scenes.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
	});

	afterEach(() => tempDir.cleanup());

	it("loads scenes.json and produces the ordered plan", () => {
		const plan = buildPalmierPlan(tempDir.path);
		expect(plan.project).toBe("synthetic");
		expect(plan.clips).toHaveLength(9);
		expect(plan.clips[0].src).toBe(
			join(tempDir.path, "scenes", "scene1_storyboard1_a.mp4"),
		);
	});

	it("throws a helpful error when scenes.json is missing", () => {
		const empty = createTempDir();
		expect(() => buildPalmierPlan(empty.path)).toThrow(/scenes\.json/);
		empty.cleanup();
	});
});

describe("compareFromManifest (A/B parallel-track)", () => {
	it("orders slots Block → scene", () => {
		const plan = compareFromManifest(manifest, "/tmp/whatever");
		expect(plan.slots.map((s) => s.scene)).toEqual([1, 2, 3, 4, 5]);
	});

	it("sets slot width = max variant duration", () => {
		const plan = compareFromManifest(manifest, "/tmp/whatever");
		const width = (n: number) =>
			plan.slots.find((s) => s.scene === n)?.slotDurationInFrames;
		expect(width(1)).toBe(60); // max(30, 60)
		expect(width(2)).toBe(30);
		expect(width(4)).toBe(60); // sole variant a spans 1..3 = 60
	});

	it("gives every variant of a scene one shared slotFromFrame, contiguous", () => {
		const plan = compareFromManifest(manifest, "/tmp/whatever");
		expect(plan.slots[0].slotFromFrame).toBe(0);
		for (let i = 1; i < plan.slots.length; i++) {
			const prev = plan.slots[i - 1];
			expect(plan.slots[i].slotFromFrame).toBe(
				prev.slotFromFrame + prev.slotDurationInFrames,
			);
		}
	});

	it("assigns lanes by variant letter (a→0, b→1), global across scenes", () => {
		const plan = compareFromManifest(manifest, "/tmp/whatever");
		const s1 = plan.slots.find((s) => s.scene === 1);
		expect(s1?.variants.find((v) => v.variant === "a")?.lane).toBe(0);
		expect(s1?.variants.find((v) => v.variant === "b")?.lane).toBe(1);
		// scene 4 carries only variant a → still lane 0.
		const s4 = plan.slots.find((s) => s.scene === 4);
		expect(s4?.variants).toHaveLength(1);
		expect(s4?.variants[0].lane).toBe(0);
	});

	it("resolves variant src to an absolute path under the project dir", () => {
		const plan = compareFromManifest(manifest, "/tmp/proj");
		expect(plan.slots[0].variants[0].src).toBe(
			resolve("/tmp/proj", "scenes/scene1_storyboard1_a.mp4"),
		);
	});

	it("loads scenes.json via buildComparePlan", () => {
		const dir = createTempDir();
		mkdirSync(join(dir.path, "scenes"), { recursive: true });
		writeFileSync(
			join(dir.path, "scenes", "scenes.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
		const plan = buildComparePlan(dir.path);
		expect(plan.slots).toHaveLength(5);
		dir.cleanup();
	});
});

describe("finalFromManifest (single-track winners)", () => {
	// In this manifest only scene 4 is single-variant; 1,2,3,5 are a+b.
	const selection: Selection = {
		"1": ["a"],
		"2": ["a"],
		"3": ["b"],
		"5": ["a", "b"],
	};

	it("emits only selected variants, ordered Block → scene → variant letter", () => {
		const plan = finalFromManifest(manifest, "/tmp/whatever", selection);
		const order = plan.clips.map((c) => `${c.block}${c.variant}${c.scene}`);
		expect(order).toEqual(["1a1", "1a2", "2b3", "2a4", "2a5", "2b5"]);
	});

	it("emits contiguous 0-based fromFrame (gaps closed by construction)", () => {
		const plan = finalFromManifest(manifest, "/tmp/whatever", selection);
		expect(plan.clips[0].fromFrame).toBe(0);
		for (let i = 1; i < plan.clips.length; i++) {
			const prev = plan.clips[i - 1];
			expect(plan.clips[i].fromFrame).toBe(
				prev.fromFrame + prev.durationInFrames,
			);
		}
	});

	it("auto-keeps a single-variant scene absent from the selection", () => {
		// scene 4 is single-variant and NOT in the selection map → auto-kept.
		const plan = finalFromManifest(manifest, "/tmp/whatever", selection);
		expect(plan.clips.some((c) => c.scene === 4 && c.variant === "a")).toBe(
			true,
		);
	});

	it('"keep both" keeps a and b adjacent, a before b', () => {
		const plan = finalFromManifest(manifest, "/tmp/whatever", selection);
		const s5 = plan.clips.filter((c) => c.scene === 5);
		expect(s5.map((c) => c.variant)).toEqual(["a", "b"]);
		expect(s5[1].fromFrame).toBe(s5[0].fromFrame + s5[0].durationInFrames);
	});

	it("throws when a multi-variant scene is left unselected", () => {
		// scene 2 (a+b) omitted → must be chosen.
		expect(() =>
			finalFromManifest(manifest, "/tmp/whatever", {
				"1": ["a"],
				"3": ["b"],
				"5": ["a"],
			}),
		).toThrow(/scene 2/i);
	});

	it("throws when a selected variant does not exist on the scene", () => {
		// scene 4 only has variant a; asking for b is an error.
		expect(() =>
			finalFromManifest(manifest, "/tmp/whatever", {
				"1": ["a"],
				"2": ["a"],
				"3": ["b"],
				"4": ["b"],
				"5": ["a"],
			}),
		).toThrow(/no variant "b"/i);
	});

	it("loads scenes.json + selection via buildFinalPlan", () => {
		const dir = createTempDir();
		mkdirSync(join(dir.path, "scenes"), { recursive: true });
		writeFileSync(
			join(dir.path, "scenes", "scenes.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
		const plan = buildFinalPlan(dir.path, selection);
		expect(plan.clips).toHaveLength(6);
		dir.cleanup();
	});
});
