import { describe, expect, it } from "vitest";
import {
	defaultProject,
	type Project,
	validateProject,
} from "../src/types/project";

describe("defaultProject", () => {
	it("produces a valid 1080x1920 30fps project", () => {
		const project = defaultProject();
		expect(project.width).toBe(1080);
		expect(project.height).toBe(1920);
		expect(project.fps).toBe(30);
		expect(project.tracks).toEqual([]);
		// Round-trips through the validator without throwing.
		expect(() => validateProject(project)).not.toThrow();
	});

	it("applies overrides", () => {
		const project = defaultProject({ title: "Promo", durationInFrames: 600 });
		expect(project.title).toBe("Promo");
		expect(project.durationInFrames).toBe(600);
	});
});

describe("validateProject", () => {
	it("parses a minimal multi-track project (round-trip)", () => {
		const input: Project = {
			id: "p1",
			title: "Multi-track",
			fps: 30,
			width: 1080,
			height: 1920,
			durationInFrames: 300,
			background: { kind: "gradient", preset: "sunset" },
			tracks: [
				{
					id: "bg",
					name: "Background",
					items: [
						{
							kind: "gradient",
							id: "g1",
							preset: "sunset",
							from: 0,
							durationInFrames: 300,
						},
					],
				},
				{
					id: "main",
					name: "Main",
					items: [
						{
							kind: "video",
							id: "v1",
							src: "clip.mp4",
							from: 0,
							durationInFrames: 150,
						},
						{
							kind: "text",
							id: "t1",
							text: "Hello",
							from: 30,
							durationInFrames: 90,
						},
						{
							kind: "caption",
							id: "c1",
							captionsPath: "captions.json",
							from: 0,
							durationInFrames: 300,
						},
						{
							kind: "motionClip",
							id: "m1",
							src: "motion/m1/title-card.mp4",
							template: "title-card",
							props: { title: "Welcome" },
							from: 150,
							durationInFrames: 150,
						},
					],
				},
			],
		};

		const parsed = validateProject(input);
		expect(parsed.tracks).toHaveLength(2);
		expect(parsed.tracks[1].items).toHaveLength(4);
		expect(parsed.tracks[1].items[0].kind).toBe("video");
		// Re-parsing the parsed output is stable.
		expect(validateProject(parsed)).toEqual(parsed);
	});

	it("throws a readable error on invalid input", () => {
		expect(() => validateProject({ id: "x" })).toThrow(/Invalid project/);
	});

	it("rejects an unknown item kind", () => {
		const bad = {
			id: "p",
			title: "t",
			width: 1080,
			height: 1920,
			durationInFrames: 100,
			tracks: [{ id: "a", name: "A", items: [{ kind: "bogus", id: "z" }] }],
		};
		expect(() => validateProject(bad)).toThrow(/Invalid project/);
	});
});
