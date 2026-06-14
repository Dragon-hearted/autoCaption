/**
 * AutoEditor — interactive browser editor server (Bun + Hono).
 *
 * Serves a single-page editor that loads the project document, shows a live
 * preview with @remotion/player, and autosaves edits back to project.json.
 *
 * MODELLED ON: systems/post-board's served editor (Hono on Bun, atomic
 * project.json writes, zod-validated PUT, static asset + media serving).
 *
 * --- HOW TO RUN ----------------------------------------------------------
 *   1. Build the player UI bundle once (or after editing public/src/*):
 *        bun run public/build.ts
 *      (produces public/dist/main.js — the React editor + @remotion/player)
 *   2. Start the server, pointing at a project.json:
 *        bun run src/server/index.ts ./my-project.json
 *      or, from the CLI once wired:
 *        bun run src/cli.ts serve ./my-project.json --port 3009
 *      or programmatically:
 *        import { startServer } from "./src/server";
 *        startServer({ port: 3009, projectPath: "./my-project.json" });
 *   3. Open http://127.0.0.1:3009
 *
 * Endpoints:
 *   GET  /              -> editor HTML (public/index.html)
 *   GET  /dist/*        -> built player bundle + editor assets
 *   GET  /media/*       -> media files resolved relative to the project dir
 *   GET  /api/project   -> read project.json (defaultProject if absent)
 *   PUT  /api/project   -> validateProject() + atomic autosave to disk
 *   POST /api/export    -> renderProject() -> mp4, returns { outputPath }
 * -------------------------------------------------------------------------
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { Hono } from "hono";
import {
	defaultProject,
	type Project,
	validateProject,
} from "../types/project";

export type StartServerOptions = {
	/** Port to bind on 127.0.0.1. Defaults to 3009 (or AUTO_EDITOR_PORT). */
	port?: number;
	/**
	 * Path to the project.json this editor reads & autosaves.
	 * Defaults to `project.json` in the current working directory.
	 */
	projectPath?: string;
};

export type StartServerResult = {
	port: number;
	url: string;
	projectPath: string;
	/** Stop the underlying Bun server. */
	stop: () => void;
};

const DEFAULT_PORT = 3009;

// `import.meta.dir` is .../src/server -> public lives at the repo root.
const PUBLIC_DIR = join(import.meta.dir, "..", "..", "public");

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Join `rel` onto `base`, refusing to escape `base` (path-traversal guard). */
function safeJoin(base: string, rel: string): string | null {
	const abs = normalize(join(base, rel));
	const root = normalize(base);
	if (abs !== root && !abs.startsWith(`${root}/`)) {
		return null;
	}
	return abs;
}

function contentTypeFor(path: string): string {
	const ext = extname(path).toLowerCase();
	switch (ext) {
		case ".html":
			return "text/html; charset=utf-8";
		case ".js":
		case ".mjs":
			return "text/javascript; charset=utf-8";
		case ".css":
			return "text/css; charset=utf-8";
		case ".json":
			return "application/json; charset=utf-8";
		case ".mp4":
			return "video/mp4";
		case ".webm":
			return "video/webm";
		case ".png":
			return "image/png";
		case ".jpg":
		case ".jpeg":
			return "image/jpeg";
		case ".svg":
			return "image/svg+xml";
		default:
			return "application/octet-stream";
	}
}

function serveFile(absPath: string | null): Response {
	if (!absPath || !existsSync(absPath)) {
		return new Response("Not found", { status: 404 });
	}
	return new Response(Bun.file(absPath), {
		headers: { "Content-Type": contentTypeFor(absPath) },
	});
}

// ---------------------------------------------------------------------------
// Project persistence (atomic write, mirrors post-board's saveProject)
// ---------------------------------------------------------------------------

async function readProject(projectPath: string): Promise<Project> {
	if (!existsSync(projectPath)) {
		// No file yet: hand the editor a sensible default to start from.
		return defaultProject({ id: "project", title: "Untitled" });
	}
	const raw = await readFile(projectPath, "utf8");
	return validateProject(JSON.parse(raw));
}

async function writeProject(
	projectPath: string,
	project: Project,
): Promise<void> {
	const dir = dirname(projectPath);
	await mkdir(dir, { recursive: true });
	const tmp = join(dir, `.project.json.${process.pid}.tmp`);
	await writeFile(tmp, `${JSON.stringify(project, null, 2)}\n`, "utf8");
	await rename(tmp, projectPath);
}

// ---------------------------------------------------------------------------
// renderProject bridge
// ---------------------------------------------------------------------------

/**
 * Lazily import renderProject so the heavy @remotion bundler/renderer is only
 * loaded when an export is actually requested — keeps server boot fast.
 */
async function loadRenderProject() {
	const mod = await import("../render");
	if (typeof mod.renderProject !== "function") {
		throw new Error("renderProject() is not exported from src/render.ts.");
	}
	return mod.renderProject;
}

function defaultExportPath(projectPath: string, project: Project): string {
	const dir = dirname(projectPath);
	const safeId = project.id.replace(/[^a-zA-Z0-9._-]/g, "_") || "project";
	return join(dir, `${safeId}.mp4`);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function createApp(projectPath: string): Hono {
	const app = new Hono();
	const projectDir = dirname(resolve(projectPath));

	app.get("/", () => serveFile(join(PUBLIC_DIR, "index.html")));

	app.get("/dist/*", (c) => {
		const rel = c.req.path.replace(/^\/dist\//, "");
		return serveFile(safeJoin(join(PUBLIC_DIR, "dist"), rel));
	});

	// Media referenced by items (video / motionClip src), resolved relative to
	// the project directory so the in-browser <Player> can load them.
	app.get("/media/*", (c) => {
		const rel = decodeURIComponent(c.req.path.replace(/^\/media\//, ""));
		return serveFile(safeJoin(projectDir, rel));
	});

	app.get("/api/project", async (c) => {
		try {
			const project = await readProject(projectPath);
			return c.json(project);
		} catch (err) {
			return c.json({ error: (err as Error).message }, 500);
		}
	});

	app.put("/api/project", async (c) => {
		const raw = await c.req.json().catch(() => null);
		if (raw === null) {
			return c.json({ error: "invalid JSON body" }, 400);
		}
		let project: Project;
		try {
			project = validateProject(raw);
		} catch (err) {
			return c.json({ error: (err as Error).message }, 400);
		}
		try {
			await writeProject(projectPath, project);
		} catch (err) {
			return c.json(
				{ error: `failed to save: ${(err as Error).message}` },
				500,
			);
		}
		return c.json(project);
	});

	app.post("/api/export", async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as {
			outputPath?: string;
		};
		let project: Project;
		try {
			project = await readProject(projectPath);
		} catch (err) {
			return c.json({ error: (err as Error).message }, 400);
		}
		let outputPath: string;
		if (typeof body.outputPath === "string" && body.outputPath.length > 0) {
			// Constrain client-supplied paths to projectDir. safeJoin rejects both
			// absolute paths and `../` traversal, preventing arbitrary file writes.
			const safe = safeJoin(projectDir, body.outputPath);
			if (!safe) {
				return c.json(
					{ error: "invalid outputPath: must not escape project directory" },
					400,
				);
			}
			outputPath = safe;
		} else {
			outputPath = defaultExportPath(projectPath, project);
		}
		try {
			const renderProject = await loadRenderProject();
			const result = await renderProject({ project, outputPath });
			return c.json({ ok: true, outputPath: result });
		} catch (err) {
			return c.json({ error: `export failed: ${(err as Error).message}` }, 500);
		}
	});

	return app;
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

export function startServer(
	options: StartServerOptions = {},
): StartServerResult {
	const projectPath = resolve(options.projectPath ?? "project.json");
	const port =
		options.port ?? (Number(process.env.AUTO_EDITOR_PORT) || DEFAULT_PORT);
	const app = createApp(projectPath);
	const server = Bun.serve({
		port,
		hostname: "127.0.0.1",
		fetch: app.fetch,
	});
	const url = `http://127.0.0.1:${port}`;
	return {
		port,
		url,
		projectPath,
		stop: () => server.stop(true),
	};
}

// ---------------------------------------------------------------------------
// CLI entry: `bun run src/server/index.ts <project.json> [--port N]`
// ---------------------------------------------------------------------------

if (import.meta.main) {
	const args = process.argv.slice(2);
	const portFlag = args.indexOf("--port");
	const port =
		portFlag >= 0 && args[portFlag + 1]
			? Number(args[portFlag + 1])
			: undefined;
	const projectPath =
		args.find((a) => !a.startsWith("--") && a !== String(port)) ??
		"project.json";
	const { url, projectPath: resolved } = startServer({ port, projectPath });
	console.log(`AutoEditor editor on ${url}`);
	console.log(`editing ${resolved}`);
}
