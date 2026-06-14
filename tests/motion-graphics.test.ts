import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	injectProps,
	resolveTemplatePath,
} from "../src/pipeline/motion-graphics";

// These tests cover the deterministic HTML-injection half of the pipeline.
// They do NOT perform a real Hyperframes render (that needs Chromium/FFmpeg);
// see the header of src/pipeline/motion-graphics.ts for the render command.

describe("resolveTemplatePath", () => {
	it("appends .html to a bare template name", () => {
		expect(resolveTemplatePath("title-card")).toMatch(
			/templates[\\/]hyperframes[\\/]title-card\.html$/,
		);
	});

	it("keeps an explicit .html file name", () => {
		expect(resolveTemplatePath("intro.html")).toMatch(/intro\.html$/);
	});

	it("returns absolute paths unchanged", () => {
		const abs = "/tmp/custom.html";
		expect(resolveTemplatePath(abs)).toBe(abs);
	});
});

describe("injectProps", () => {
	const minimal =
		'<html><head></head><body><div id="stage" data-composition-id="t" data-width="1080" data-height="1920"></div><!--__HF_PROPS__--></body></html>';

	it("replaces the props marker with a window.__props script", () => {
		const out = injectProps(minimal, { title: "Hello" });
		expect(out).not.toContain("<!--__HF_PROPS__-->");
		expect(out).toContain('window.__props = {"title":"Hello"}');
		expect(out).toContain('<script id="hf-props">');
	});

	it("overrides stage dimensions when provided", () => {
		const out = injectProps(minimal, {}, { width: 1920, height: 1080 });
		expect(out).toContain('data-width="1920"');
		expect(out).toContain('data-height="1080"');
	});

	it("escapes a closing script tag inside string values", () => {
		const out = injectProps(minimal, { title: "</script><b>x" });
		expect(out).not.toContain("</script><b>x");
		expect(out).toContain("<\\/script>");
	});

	it("falls back to inserting before </body> when no marker is present", () => {
		const noMarker = "<html><head></head><body></body></html>";
		const out = injectProps(noMarker, { a: 1 });
		expect(out).toContain('window.__props = {"a":1}');
		expect(out.indexOf("hf-props")).toBeLessThan(out.indexOf("</body>"));
	});

	it("produces a still-valid HTML document for every shipped template", () => {
		for (const name of ["title-card", "lower-third", "intro", "transition"]) {
			const raw = readFileSync(resolveTemplatePath(name), "utf8");
			const out = injectProps(
				raw,
				{ durationInSeconds: 3, title: "T", brand: "B", name: "N", label: "L" },
				{ width: 1080, height: 1920 },
			);
			expect(out).toContain("<!DOCTYPE html>");
			expect(out).toContain("</html>");
			expect(out).toContain('<script id="hf-props">');
			expect(out).toContain(`data-composition-id="${name}"`);
			expect(out).not.toContain("<!--__HF_PROPS__-->");
		}
	});
});
