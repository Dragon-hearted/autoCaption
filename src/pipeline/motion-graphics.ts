import { spawn } from "node:child_process";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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

// Templates load GSAP from `vendor/gsap.min.js` (repo-controlled) instead of a
// CDN, so renders don't depend on third-party network availability. The vendored
// file is copied into each render dir alongside `index.html` so the relative
// `<script src="vendor/gsap.min.js">` resolves at render time.
const VENDOR_GSAP_REL = join("vendor", "gsap.min.js");
const VENDOR_GSAP_SRC = join(TEMPLATES_DIR, VENDOR_GSAP_REL);

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
	// Constrain relative templates to TEMPLATES_DIR so a crafted `clip.template`
	// (e.g. "../../etc/passwd") can't traverse out of the template root.
	const resolved = resolve(TEMPLATES_DIR, fileName);
	const rel = relative(TEMPLATES_DIR, resolved);
	if (rel.startsWith("..") || isAbsolute(rel)) {
		throw new Error(`Template path escapes templates dir: ${template}`);
	}
	return resolved;
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

	// The `hyperframes render` CLI takes a project *directory* and renders that
	// dir's `index.html` — passing an HTML file path fails with "Not a directory".
	// A per-invocation temp dir (mkdtemp) gives each render a unique staging dir
	// and output path so concurrent renders of the same template can't clobber
	// each other's `index.html` / mp4.
	const renderDir = await mkdtemp(join(outDir, `.hf-${base}-`));
	const outPath = join(renderDir, `${base}.mp4`);
	const htmlPath = join(renderDir, "index.html");

	await writeFile(htmlPath, injected, "utf8");

	// Stage the vendored GSAP next to index.html so `vendor/gsap.min.js` resolves
	// during the headless render without any network access.
	const vendorDir = join(renderDir, "vendor");
	await mkdir(vendorDir, { recursive: true });
	await copyFile(VENDOR_GSAP_SRC, join(vendorDir, "gsap.min.js"));

	await runHyperframesRender(renderDir, outPath, fps);

	return outPath;
}

/** Wall-clock cap for a single hyperframes render before it is aborted. */
const RENDER_TIMEOUT_MS = 120_000;

/** Spawn `bunx hyperframes render`, resolving with the output path on success. */
function runHyperframesRender(
	renderDir: string,
	outPath: string,
	fps: number,
	timeoutMs: number = RENDER_TIMEOUT_MS,
): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(
			"bunx",
			["hyperframes", "render", renderDir, "-o", outPath, "--fps", String(fps)],
			{ stdio: "inherit" },
		);

		// Guard against a hung Chromium/Hyperframes never settling this promise.
		const timeout = setTimeout(() => {
			child.kill("SIGTERM");
			reject(new Error(`hyperframes render timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		child.on("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});
		child.on("close", (code) => {
			clearTimeout(timeout);
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
