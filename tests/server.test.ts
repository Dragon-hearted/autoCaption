import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, safeJoin } from "../src/server/index";
import { createTempDir } from "./setup";

// The Scene Library's /scenes/* route mirrors /media/*: it serves the
// storyboard slice output (scenes.json + clips + poster jpgs) through the same
// safeJoin path-traversal guard. These cover the guard directly and via the
// route. NOTE: actually serving a file body uses Bun.file, which is undefined
// under vitest/Node — so byte-serving is smoke-tested against the real Bun
// server (curl), and here we assert the guard (traversal / missing → 404).

describe("safeJoin path-traversal guard", () => {
	it("joins a normal relative path inside the base", () => {
		expect(safeJoin("/base", "scene1_storyboard1_a.mp4")).toBe(
			"/base/scene1_storyboard1_a.mp4",
		);
	});

	it("collapses harmless interior traversal that stays inside", () => {
		expect(safeJoin("/base", "sub/../ok.jpg")).toBe("/base/ok.jpg");
	});

	it("rejects `../` escapes", () => {
		expect(safeJoin("/base", "../secret.txt")).toBeNull();
		expect(safeJoin("/base", "../../etc/passwd")).toBeNull();
	});
});

describe("GET /scenes/* route", () => {
	let tmp: { path: string; cleanup: () => void };
	let app: ReturnType<typeof createApp>;

	beforeEach(() => {
		tmp = createTempDir();
		const scenesDir = join(tmp.path, "scenes");
		mkdirSync(scenesDir, { recursive: true });
		writeFileSync(
			join(scenesDir, "scenes.json"),
			JSON.stringify({
				project: "fixture",
				scenes: [
					{
						scene: 1,
						block: 1,
						beat: null,
						variants: [
							{
								variant: "a",
								clip: "scenes/scene1_storyboard1_a.mp4",
								thumb: "scenes/scene1_storyboard1_a.jpg",
								source_video: "seedance-v2/renders/block1-a.mp4",
								start: 0,
								end: 1,
								fps: 30,
								description: "fixture shot",
								beat: null,
								camera_move: null,
							},
						],
					},
				],
			}),
		);
		writeFileSync(join(scenesDir, "scene1_storyboard1_a.jpg"), "JPEGBYTES");
		// Secret sits next to the storyboard dir — a traversal target.
		writeFileSync(join(tmp.path, "secret.txt"), "TOPSECRET");
		app = createApp(join(tmp.path, "project.json"), scenesDir);
	});

	afterEach(() => {
		tmp.cleanup();
	});

	it("404s a missing file", async () => {
		const res = await app.fetch(new Request("http://x/scenes/nope.mp4"));
		expect(res.status).toBe(404);
	});

	it("refuses to escape the scenes dir (encoded ../)", async () => {
		const res = await app.fetch(
			new Request("http://x/scenes/%2e%2e%2fsecret.txt"),
		);
		expect(res.status).toBe(404);
	});
});
