import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Render a motion-graphic clip from a Hyperframes HTML template to an mp4.
 *
 * Pipeline: read template -> inject `window.__props` (+ stage dimensions) ->
 * stage the injected HTML as `index.html` in a per-clip render dir -> invoke the
 * Hyperframes CLI on that dir to capture frames and encode the mp4 -> return the
 * output path.
 *
 * NOTE: `hyperframes render` takes a project *directory* (and renders that dir's
 * `index.html`), NOT a single HTML file — passing a file path fails with
 * "Not a directory". renderMotionClip() handles the staging for you.
 *
 * Hyperframes renders by driving a real Chromium via Puppeteer. In this repo the
 * Puppeteer/Chromium postinstall was blocked by bun, so a *real* render needs a
 * one-time browser install first. If that download is prohibitive, the
 * HTML-injection half of this module is still exercised by tests/motion-graphics.test.ts.
 *
 * To render manually (after installing the browser):
 *   bunx puppeteer browsers install chrome      # one-time, ~150MB
 *   # or:  bun pm trust hyperframes && bun install
 *   bunx hyperframes doctor                      # verify Chrome + FFmpeg
 *   mkdir clipdir && cp injected.html clipdir/index.html
 *   bunx hyperframes render clipdir -o out.mp4 --fps 30
 *
 * renderMotionClip() runs the equivalent `bunx hyperframes render <dir>` for you.
 */

const TEMPLATES_DIR = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../templates/hyperframes",
);

const PROPS_MARKER = "<!--__HF_PROPS__-->";

export type RenderMotionClipOptions = {
	/** Template name ("title-card"), file name ("title-card.html"), or absolute path. */
	template: string;
	/** Values injected as `window.__props` (text, colors, etc.). */
	props: Record<string, unknown>;
	durationInFrames: number;
	fps: number;
	width: number;
	height: number;
	/** Directory the injected HTML + final mp4 are written into. */
	outDir: string;
};

/** Resolve a template reference to an absolute `.html` path. */
export function resolveTemplatePath(template: string): string {
	if (isAbsolute(template)) {
		return template;
	}
	const fileName = template.endsWith(".html") ? template : `${template}.html`;
	return join(TEMPLATES_DIR, fileName);
}

/** JSON-encode props so they can sit safely inside an inline <script>. */
function serializeProps(props: Record<string, unknown>): string {
	// Escape `</` so a string value cannot terminate the <script> element.
	return JSON.stringify(props).replace(/<\//g, "<\\/");
}

/**
 * Inject props into a template, returning a complete HTML string.
 *
 * - Sets `window.__props` (replacing the `<!--__HF_PROPS__-->` marker, or
 *   inserting before `</head>` / `</body>` as a fallback).
 * - Overrides the stage `data-width` / `data-height` so the render matches the
 *   requested dimensions.
 *
 * Pure and deterministic — this is what tests assert without a real render.
 */
export function injectProps(
	template: string,
	props: Record<string, unknown>,
	dimensions?: { width?: number; height?: number },
): string {
	const propsScript = `<script id="hf-props">window.__props = ${serializeProps(
		props,
	)};</script>`;

	let html = template.includes(PROPS_MARKER)
		? template.replace(PROPS_MARKER, propsScript)
		: insertBefore(template, propsScript);

	if (dimensions?.width != null) {
		html = html.replace(
			/data-width="\d+"/,
			`data-width="${Math.round(dimensions.width)}"`,
		);
	}
	if (dimensions?.height != null) {
		html = html.replace(
			/data-height="\d+"/,
			`data-height="${Math.round(dimensions.height)}"`,
		);
	}

	return html;
}

function insertBefore(html: string, snippet: string): string {
	for (const tag of ["</head>", "</body>", "</html>"]) {
		const idx = html.lastIndexOf(tag);
		if (idx !== -1) {
			return `${html.slice(0, idx)}${snippet}\n${html.slice(idx)}`;
		}
	}
	return `${html}\n${snippet}`;
}

export async function renderMotionClip(
	options: RenderMotionClipOptions,
): Promise<string> {
	const { template, props, durationInFrames, fps, width, height, outDir } =
		options;

	const templatePath = resolveTemplatePath(template);
	const raw = await readFile(templatePath, "utf8");

	const durationInSeconds = durationInFrames / fps;
	const injected = injectProps(
		raw,
		{ ...props, durationInFrames, fps, durationInSeconds },
		{ width, height },
	);

	await mkdir(outDir, { recursive: true });

	const base =
		template
			.replace(/\.html$/, "")
			.split(/[\\/]/)
			.pop() ?? "clip";
	const outPath = join(outDir, `${base}.mp4`);

	// The `hyperframes render` CLI takes a project *directory* and renders that
	// dir's `index.html` — passing an HTML file path fails with "Not a directory".
	// Stage the injected HTML as `index.html` in a per-clip render dir.
	const renderDir = join(outDir, `.hf-${base}`);
	await mkdir(renderDir, { recursive: true });
	const htmlPath = join(renderDir, "index.html");

	await writeFile(htmlPath, injected, "utf8");

	await runHyperframesRender(renderDir, outPath, fps);

	return outPath;
}

/** Spawn `bunx hyperframes render`, resolving with the output path on success. */
function runHyperframesRender(
	renderDir: string,
	outPath: string,
	fps: number,
): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(
			"bunx",
			["hyperframes", "render", renderDir, "-o", outPath, "--fps", String(fps)],
			{ stdio: "inherit" },
		);

		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolvePromise();
			} else {
				reject(
					new Error(
						`hyperframes render exited with code ${code}. ` +
							"If this is a Chromium/Puppeteer error, run `bunx puppeteer browsers install chrome` first.",
					),
				);
			}
		});
	});
}
