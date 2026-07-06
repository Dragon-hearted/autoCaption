/**
 * palmier-ctl — drive the palmier-pro desktop app and its MCP server over raw
 * Streamable-HTTP JSON-RPC (no MCP client dep, works mid-session).
 *
 * palmier-pro's server lives INSIDE the GUI app (no headless mode): "start the
 * server" == launch the app. The server binds 127.0.0.1:19789 within ~2-3s of
 * launch with zero interaction. Since v0.5.1 the server ships project-lifecycle
 * tools (get_projects / open_project / new_project); older builds lack them and
 * every op here degrades with a clear upgrade message instead of failing weird.
 *
 * Transport note (verified live on v0.6.1): responses may arrive as plain JSON
 * or SSE-framed (`data: {...}` lines) depending on server session state — rpc()
 * tolerates both. Calls are stateless; no Mcp-Session-Id required.
 */
import { execFileSync } from "node:child_process";

const ENDPOINT = process.env.PALMIER_MCP_URL ?? "http://127.0.0.1:19789/mcp";
const APP_NAME = "PalmierPro";
const PROJECT_TOOLS = ["get_projects", "open_project", "new_project"] as const;

interface RpcEnvelope {
	result?: Record<string, unknown>;
	error?: { code: number; message: string };
}

/** POST a JSON-RPC call; parse a plain-JSON or SSE-framed reply. */
async function rpc(
	method: string,
	params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const res = await fetch(ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});
	if (!res.ok) {
		throw new Error(`palmier MCP HTTP ${res.status} for ${method}`);
	}

	const body = await res.text();
	let envelope: RpcEnvelope | undefined;
	if (body.trimStart().startsWith("{")) {
		envelope = JSON.parse(body) as RpcEnvelope;
	} else {
		// SSE framing: keep the last `data:` line that parses as a JSON object.
		for (const line of body.split(/\r?\n/)) {
			if (!line.startsWith("data:")) continue;
			try {
				envelope = JSON.parse(line.slice(5)) as RpcEnvelope;
			} catch {
				// partial/empty data line — ignore
			}
		}
	}
	if (!envelope) {
		throw new Error(`Unparseable palmier MCP reply for ${method}`);
	}
	if (envelope.error) {
		throw new Error(`palmier MCP error: ${envelope.error.message}`);
	}
	return envelope.result ?? {};
}

/**
 * tools/call wrapper. The payload is a JSON *string* at result.content[0].text
 * — parsed a second time. Tool-level failures set isError + a message text.
 */
async function callTool(
	name: string,
	args: Record<string, unknown> = {},
): Promise<unknown> {
	const result = await rpc("tools/call", { name, arguments: args });
	const content = (result.content as Array<{ text?: string }>) ?? [];
	const text = content[0]?.text ?? "";
	if (result.isError) {
		throw new Error(`${name}: ${text || "tool call failed"}`);
	}
	try {
		return JSON.parse(text);
	} catch {
		return text; // some tools return plain text
	}
}

export interface ServerProbe {
	name: string;
	version: string;
}

/** initialize → serverInfo, or null when the server is down. */
export async function probe(): Promise<ServerProbe | null> {
	try {
		const result = await rpc("initialize", {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "auto-editor", version: "0" },
		});
		const info = (result.serverInfo ?? {}) as Partial<ServerProbe>;
		return { name: info.name ?? "palmier-pro", version: info.version ?? "?" };
	} catch {
		return null;
	}
}

export interface PalmierProjectEntry {
	id: string;
	name: string;
	path: string;
	isOpen: boolean;
	isActive: boolean;
	isAccessible: boolean;
}

export interface PalmierStatus {
	up: boolean;
	server?: ServerProbe;
	toolCount?: number;
	hasProjectTools?: boolean;
	projects?: PalmierProjectEntry[];
	/** fps/width/height of the active timeline, when a project is open. */
	timeline?: { fps?: number; width?: number; height?: number };
	canGenerate?: boolean;
}

export async function getStatus(): Promise<PalmierStatus> {
	const server = await probe();
	if (!server) return { up: false };

	const tools = (await rpc("tools/list", {})).tools as Array<{ name: string }>;
	const names = new Set(tools.map((t) => t.name));
	const status: PalmierStatus = {
		up: true,
		server,
		toolCount: tools.length,
		hasProjectTools: PROJECT_TOOLS.every((t) => names.has(t)),
	};

	if (status.hasProjectTools) {
		const listing = (await callTool("get_projects")) as {
			projects?: PalmierProjectEntry[];
		};
		status.projects = listing.projects ?? [];
	}

	// get_timeline errors with "Editor not available" when no project is open.
	try {
		const t = (await callTool("get_timeline")) as Record<string, unknown>;
		const settings = (t.settings ?? t) as Record<string, unknown>;
		status.timeline = {
			fps: settings.fps as number | undefined,
			width: settings.width as number | undefined,
			height: settings.height as number | undefined,
		};
		status.canGenerate = (settings.canGenerate ?? t.canGenerate) as
			| boolean
			| undefined;
	} catch {
		// no project open — leave timeline undefined
	}

	return status;
}

export interface LaunchResult {
	alreadyRunning: boolean;
	secondsToBind: number;
	status: PalmierStatus;
}

/**
 * Ensure the palmier-pro MCP server is up: no-op when already bound, else
 * `open -ga PalmierPro` (background, no focus steal) and poll until it binds.
 */
export async function launchAndWait(timeoutMs = 20_000): Promise<LaunchResult> {
	if (await probe()) {
		return {
			alreadyRunning: true,
			secondsToBind: 0,
			status: await getStatus(),
		};
	}

	try {
		execFileSync("open", ["-ga", APP_NAME]);
	} catch {
		throw new Error(
			`Could not launch ${APP_NAME}.app — is palmier-pro installed? (https://github.com/palmier-io/palmier-pro/releases)`,
		);
	}

	const started = Date.now();
	while (Date.now() - started < timeoutMs) {
		await new Promise((r) => setTimeout(r, 1000));
		if (await probe()) {
			return {
				alreadyRunning: false,
				secondsToBind: Math.round((Date.now() - started) / 1000),
				status: await getStatus(),
			};
		}
	}
	throw new Error(
		`palmier MCP server did not bind ${ENDPOINT} within ${timeoutMs / 1000}s of launching ${APP_NAME}.`,
	);
}

export interface CreateProjectOptions {
	name: string;
	fps?: number;
	width?: number;
	height?: number;
}

const UPGRADE_HINT =
	"this palmier-pro build predates the project tools (v0.5.1+). Update the app (PalmierPro → Check for Updates) and retry.";

/**
 * Create (and open) a named .palmier project via new_project, then apply
 * fps/width/height via set_project_settings when provided. The app must be
 * running — call launchAndWait() first. Projects land in ~/Documents/Palmier Pro.
 */
export async function createPalmierProject(
	opts: CreateProjectOptions,
): Promise<{ project: unknown; timeline?: PalmierStatus["timeline"] }> {
	const status = await getStatus();
	if (!status.up) {
		throw new Error(
			"palmier MCP server is down — run `auto-editor palmier launch` first.",
		);
	}
	if (!status.hasProjectTools) {
		throw new Error(`new_project unavailable — ${UPGRADE_HINT}`);
	}

	const project = await callTool("new_project", { name: opts.name });

	const settings: Record<string, number> = {};
	if (opts.fps !== undefined) settings.fps = opts.fps;
	if (opts.width !== undefined) settings.width = opts.width;
	if (opts.height !== undefined) settings.height = opts.height;
	if (Object.keys(settings).length > 0) {
		await callTool("set_project_settings", settings);
	}

	return { project, timeline: (await getStatus()).timeline };
}
