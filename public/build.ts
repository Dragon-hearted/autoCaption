/**
 * Build the browser editor bundle.
 *
 *   bun run public/build.ts            # one-shot build
 *   bun run public/build.ts --watch    # rebuild on change
 *
 * Bundles public/src/main.tsx (React + @remotion/player + the Timeline
 * composition) into public/dist/main.js, which public/index.html loads as
 * an ES module. The AutoEditor server (src/server/index.ts) serves
 * public/dist/* at /dist/*.
 */

import { join } from "node:path";

const watch = process.argv.includes("--watch");

async function buildOnce(): Promise<boolean> {
	const result = await Bun.build({
		entrypoints: [join(import.meta.dir, "src", "main.tsx")],
		outdir: join(import.meta.dir, "dist"),
		target: "browser",
		format: "esm",
		minify: false,
		sourcemap: "linked",
		naming: "[name].js",
		define: { "process.env.NODE_ENV": '"development"' },
	});
	if (!result.success) {
		for (const log of result.logs) {
			console.error(log);
		}
		return false;
	}
	console.log(
		`built ${result.outputs.length} file(s) -> public/dist/ (${new Date().toISOString()})`,
	);
	return true;
}

const ok = await buildOnce();
if (!ok && !watch) {
	process.exit(1);
}

if (watch) {
	const { watch: fsWatch } = await import("node:fs");
	console.log("watching public/src for changes…");
	let timer: ReturnType<typeof setTimeout> | null = null;
	fsWatch(join(import.meta.dir, "src"), { recursive: true }, () => {
		if (timer) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			void buildOnce();
		}, 120);
	});
	// Keep the process alive.
	await new Promise(() => {});
}
