/**
 * AutoEditor browser editor (single-page React app).
 *
 * Loads the Project document from /api/project, shows a live preview with
 * @remotion/player bound to the Timeline composition, and autosaves edits
 * back to disk via PUT /api/project. Built by public/build.ts into
 * public/dist/main.js and served at /dist/main.js by src/server/index.ts.
 *
 * NOTE: imports the shared Timeline composition (task #2) and the Project
 * types (task #1) directly from src/ so the preview renders exactly what
 * `renderProject()` will export.
 */

import { Player } from "@remotion/player";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Timeline } from "../../src/compositions/Timeline";
import type { Item, Project, Track } from "../../src/types/project";

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function apiGetProject(): Promise<Project> {
	const res = await fetch("/api/project");
	if (!res.ok) {
		throw new Error(`GET /api/project -> ${res.status}`);
	}
	return (await res.json()) as Project;
}

async function apiPutProject(project: Project): Promise<Project> {
	const res = await fetch("/api/project", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(project),
	});
	const data = await res.json();
	if (!res.ok) {
		throw new Error((data as { error?: string }).error ?? `PUT ${res.status}`);
	}
	return data as Project;
}

async function apiExport(): Promise<{ outputPath: string }> {
	const res = await fetch("/api/export", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});
	const data = await res.json();
	if (!res.ok) {
		throw new Error((data as { error?: string }).error ?? `export ${res.status}`);
	}
	return data as { outputPath: string };
}

// ---------------------------------------------------------------------------
// Item factories + helpers
// ---------------------------------------------------------------------------

const ITEM_KINDS: Item["kind"][] = [
	"video",
	"text",
	"caption",
	"motionClip",
	"gradient",
];

function makeId(kind: string): string {
	const rand =
		typeof crypto !== "undefined" && "randomUUID" in crypto
			? crypto.randomUUID().slice(0, 8)
			: Math.floor(Math.random() * 1e8).toString(36);
	return `${kind}-${rand}`;
}

function newItem(kind: Item["kind"], from: number): Item {
	const base = { id: makeId(kind), from, durationInFrames: 90 } as const;
	switch (kind) {
		case "video":
			return { kind, ...base, src: "media/clip.mp4" };
		case "text":
			return {
				kind,
				...base,
				text: "New text",
				fontSize: 80,
				color: "#ffffff",
				position: "center",
			};
		case "caption":
			return {
				kind,
				...base,
				captionsPath: "captions.json",
				position: "bottom",
			};
		case "motionClip":
			return { kind, ...base, src: "media/motion.mp4" };
		case "gradient":
			return { kind, ...base, preset: "halo" };
	}
}

type Selection = { trackId: string; itemId: string } | null;

function findItem(
	project: Project,
	sel: Selection,
): { track: Track; item: Item } | null {
	if (!sel) {
		return null;
	}
	const track = project.tracks.find((t) => t.id === sel.trackId);
	const item = track?.items.find((i) => i.id === sel.itemId);
	if (!track || !item) {
		return null;
	}
	return { track, item };
}

// ---------------------------------------------------------------------------
// Inspector — edit the selected item
// ---------------------------------------------------------------------------

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<label style={{ display: "block", marginBottom: 8 }}>
			<span
				style={{ display: "block", color: "var(--muted)", marginBottom: 3 }}
			>
				{label}
			</span>
			{children}
		</label>
	);
}

function Inspector({
	item,
	onChange,
	onDelete,
}: {
	item: Item;
	onChange: (next: Item) => void;
	onDelete: () => void;
}) {
	const patch = (p: Partial<Item>) => onChange({ ...item, ...p } as Item);
	const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

	return (
		<div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 10,
				}}
			>
				<strong style={{ textTransform: "uppercase", letterSpacing: 1 }}>
					{item.kind}
				</strong>
				<button type="button" onClick={onDelete} style={{ color: "var(--danger)" }}>
					Delete
				</button>
			</div>

			<Field label="from (frame)">
				<input
					type="number"
					value={item.from}
					onChange={(e) => patch({ from: num(e.target.value) })}
				/>
			</Field>
			<Field label="duration (frames)">
				<input
					type="number"
					value={item.durationInFrames}
					onChange={(e) =>
						patch({ durationInFrames: Math.max(1, num(e.target.value)) })
					}
				/>
			</Field>

			{item.kind === "text" && (
				<>
					<Field label="text">
						<input
							value={item.text}
							onChange={(e) => patch({ text: e.target.value })}
						/>
					</Field>
					<Field label="color">
						<input
							type="color"
							value={item.color ?? "#ffffff"}
							onChange={(e) => patch({ color: e.target.value })}
						/>
					</Field>
					<Field label="font size">
						<input
							type="number"
							value={item.fontSize ?? 80}
							onChange={(e) => patch({ fontSize: num(e.target.value) })}
						/>
					</Field>
					<Field label="position">
						<select
							value={item.position ?? "center"}
							onChange={(e) =>
								patch({ position: e.target.value as typeof item.position })
							}
						>
							<option value="top">top</option>
							<option value="center">center</option>
							<option value="bottom">bottom</option>
						</select>
					</Field>
				</>
			)}

			{(item.kind === "video" || item.kind === "motionClip") && (
				<Field label="src (relative to project)">
					<input
						value={item.src}
						onChange={(e) => patch({ src: e.target.value })}
					/>
				</Field>
			)}

			{item.kind === "caption" && (
				<>
					<Field label="captions path">
						<input
							value={item.captionsPath}
							onChange={(e) => patch({ captionsPath: e.target.value })}
						/>
					</Field>
					<Field label="highlight color">
						<input
							type="color"
							value={item.highlightColor ?? "#6ea8fe"}
							onChange={(e) => patch({ highlightColor: e.target.value })}
						/>
					</Field>
					<Field label="position">
						<select
							value={item.position ?? "bottom"}
							onChange={(e) =>
								patch({ position: e.target.value as typeof item.position })
							}
						>
							<option value="top">top</option>
							<option value="center">center</option>
							<option value="bottom">bottom</option>
						</select>
					</Field>
				</>
			)}

			{item.kind === "gradient" && (
				<Field label="preset">
					<input
						value={item.preset}
						onChange={(e) => patch({ preset: e.target.value })}
					/>
				</Field>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Timeline strip
// ---------------------------------------------------------------------------

const KIND_COLOR: Record<Item["kind"], string> = {
	video: "#3b6ea5",
	text: "#6a9955",
	caption: "#b58900",
	motionClip: "#a05bc4",
	gradient: "#c45b7c",
};

function TimelineStrip({
	project,
	selection,
	pxPerFrame,
	onSelect,
	onMoveItem,
}: {
	project: Project;
	selection: Selection;
	pxPerFrame: number;
	onSelect: (sel: Selection) => void;
	onMoveItem: (trackId: string, itemId: string, from: number) => void;
}) {
	const width = Math.max(project.durationInFrames * pxPerFrame, 200);

	const onPointerDown = (
		e: React.PointerEvent,
		track: Track,
		item: Item,
	) => {
		onSelect({ trackId: track.id, itemId: item.id });
		const startX = e.clientX;
		const startFrom = item.from;
		const move = (ev: PointerEvent) => {
			const deltaFrames = Math.round((ev.clientX - startX) / pxPerFrame);
			onMoveItem(track.id, item.id, Math.max(0, startFrom + deltaFrames));
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	return (
		<div style={{ overflowX: "auto", padding: "8px 0" }}>
			<div style={{ width, minWidth: "100%" }}>
				{project.tracks.length === 0 && (
					<div style={{ color: "var(--muted)", padding: 12 }}>
						No tracks yet — add an item to create one.
					</div>
				)}
				{project.tracks.map((track) => (
					<div key={track.id} style={{ marginBottom: 6 }}>
						<div
							style={{
								color: "var(--muted)",
								fontSize: 11,
								marginBottom: 2,
							}}
						>
							{track.name}
						</div>
						<div
							style={{
								position: "relative",
								height: 36,
								background: "var(--panel)",
								borderRadius: 6,
								border: "1px solid var(--line)",
							}}
						>
							{track.items.map((item) => {
								const selected =
									selection?.trackId === track.id &&
									selection?.itemId === item.id;
								return (
									<div
										key={item.id}
										onPointerDown={(e) => onPointerDown(e, track, item)}
										title={`${item.kind} @ ${item.from} (${item.durationInFrames}f)`}
										style={{
											position: "absolute",
											left: item.from * pxPerFrame,
											width: Math.max(item.durationInFrames * pxPerFrame, 6),
											top: 3,
											bottom: 3,
											background: KIND_COLOR[item.kind],
											border: selected
												? "2px solid var(--accent)"
												: "1px solid rgba(0,0,0,0.4)",
											borderRadius: 4,
											color: "#fff",
											fontSize: 11,
											padding: "0 6px",
											lineHeight: "30px",
											whiteSpace: "nowrap",
											overflow: "hidden",
											cursor: "grab",
											boxSizing: "border-box",
										}}
									>
										{item.kind}
									</div>
								);
							})}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
	const [project, setProject] = useState<Project | null>(null);
	const [selection, setSelection] = useState<Selection>(null);
	const [status, setStatus] = useState<string>("loading…");
	const [pxPerFrame, setPxPerFrame] = useState(2);
	const [exporting, setExporting] = useState(false);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const dirty = useRef(false);

	// Initial load.
	useEffect(() => {
		apiGetProject()
			.then((p) => {
				setProject(p);
				setStatus("ready");
			})
			.catch((err) => setStatus(`load failed: ${err.message}`));
	}, []);

	// Debounced autosave whenever the project changes (after first load).
	useEffect(() => {
		if (!project || !dirty.current) {
			return;
		}
		if (saveTimer.current) {
			clearTimeout(saveTimer.current);
		}
		setStatus("saving…");
		saveTimer.current = setTimeout(() => {
			apiPutProject(project)
				.then(() => setStatus("saved"))
				.catch((err) => setStatus(`save failed: ${err.message}`));
		}, 500);
		return () => {
			if (saveTimer.current) {
				clearTimeout(saveTimer.current);
			}
		};
	}, [project]);

	const mutate = useCallback((next: Project) => {
		dirty.current = true;
		setProject(next);
	}, []);

	const ensureTrack = useCallback(
		(p: Project): { project: Project; trackId: string } => {
			if (p.tracks.length > 0) {
				return { project: p, trackId: p.tracks[0].id };
			}
			const track: Track = { id: makeId("track"), name: "Track 1", items: [] };
			return { project: { ...p, tracks: [track] }, trackId: track.id };
		},
		[],
	);

	const addItem = useCallback(
		(kind: Item["kind"]) => {
			if (!project) {
				return;
			}
			const { project: withTrack, trackId } = ensureTrack(project);
			const item = newItem(kind, 0);
			const tracks = withTrack.tracks.map((t) =>
				t.id === trackId ? { ...t, items: [...t.items, item] } : t,
			);
			mutate({ ...withTrack, tracks });
			setSelection({ trackId, itemId: item.id });
		},
		[project, ensureTrack, mutate],
	);

	const updateItem = useCallback(
		(trackId: string, itemId: string, next: Item) => {
			if (!project) {
				return;
			}
			const tracks = project.tracks.map((t) =>
				t.id === trackId
					? {
							...t,
							items: t.items.map((i) => (i.id === itemId ? next : i)),
						}
					: t,
			);
			mutate({ ...project, tracks });
		},
		[project, mutate],
	);

	const moveItemFrom = useCallback(
		(trackId: string, itemId: string, from: number) => {
			if (!project) {
				return;
			}
			const tracks = project.tracks.map((t) =>
				t.id === trackId
					? {
							...t,
							items: t.items.map((i) =>
								i.id === itemId ? ({ ...i, from } as Item) : i,
							),
						}
					: t,
			);
			mutate({ ...project, tracks });
		},
		[project, mutate],
	);

	const deleteItem = useCallback(
		(trackId: string, itemId: string) => {
			if (!project) {
				return;
			}
			const tracks = project.tracks.map((t) =>
				t.id === trackId
					? { ...t, items: t.items.filter((i) => i.id !== itemId) }
					: t,
			);
			mutate({ ...project, tracks });
			setSelection(null);
		},
		[project, mutate],
	);

	const reorderSelected = useCallback(
		(dir: -1 | 1) => {
			if (!project || !selection) {
				return;
			}
			const tracks = project.tracks.map((t) => {
				if (t.id !== selection.trackId) {
					return t;
				}
				const idx = t.items.findIndex((i) => i.id === selection.itemId);
				const swap = idx + dir;
				if (idx < 0 || swap < 0 || swap >= t.items.length) {
					return t;
				}
				const items = [...t.items];
				[items[idx], items[swap]] = [items[swap], items[idx]];
				return { ...t, items };
			});
			mutate({ ...project, tracks });
		},
		[project, selection, mutate],
	);

	const onExport = useCallback(() => {
		setExporting(true);
		setStatus("exporting… (rendering mp4)");
		apiExport()
			.then((r) => setStatus(`exported -> ${r.outputPath}`))
			.catch((err) => setStatus(`export failed: ${err.message}`))
			.finally(() => setExporting(false));
	}, []);

	const selected = useMemo(
		() => (project ? findItem(project, selection) : null),
		[project, selection],
	);

	if (!project) {
		return (
			<div style={{ padding: 48 }}>
				<h1>AutoEditor editor</h1>
				<p>{status}</p>
			</div>
		);
	}

	const previewWidth = 320;
	const previewHeight = Math.round(
		(previewWidth * project.height) / project.width,
	);

	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "1fr 300px",
				gridTemplateRows: "auto 1fr auto",
				height: "100vh",
			}}
		>
			{/* Toolbar */}
			<header
				style={{
					gridColumn: "1 / 3",
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "10px 14px",
					borderBottom: "1px solid var(--line)",
					background: "var(--panel)",
				}}
			>
				<strong style={{ marginRight: 8 }}>{project.title}</strong>
				<span style={{ color: "var(--muted)" }}>
					{project.width}×{project.height} · {project.fps}fps ·{" "}
					{project.durationInFrames}f
				</span>
				<div style={{ flex: 1 }} />
				{ITEM_KINDS.map((k) => (
					<button key={k} type="button" onClick={() => addItem(k)}>
						+ {k}
					</button>
				))}
				<button
					type="button"
					className="primary"
					disabled={exporting}
					onClick={onExport}
				>
					{exporting ? "Exporting…" : "Export mp4"}
				</button>
			</header>

			{/* Preview */}
			<main
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: 16,
					overflow: "auto",
					background: "#000",
				}}
			>
				<div
					style={{
						width: previewWidth,
						height: previewHeight,
						boxShadow: "0 0 0 1px var(--line)",
					}}
				>
					<Player
						component={Timeline}
						inputProps={{ project }}
						durationInFrames={project.durationInFrames}
						fps={project.fps}
						compositionWidth={project.width}
						compositionHeight={project.height}
						style={{ width: previewWidth, height: previewHeight }}
						controls
						loop
					/>
				</div>
			</main>

			{/* Inspector */}
			<aside
				style={{
					gridRow: "2 / 3",
					padding: 14,
					borderLeft: "1px solid var(--line)",
					background: "var(--panel)",
					overflow: "auto",
				}}
			>
				{selected ? (
					<>
						<div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
							<button type="button" onClick={() => reorderSelected(-1)}>
								↑ order
							</button>
							<button type="button" onClick={() => reorderSelected(1)}>
								↓ order
							</button>
						</div>
						<Inspector
							item={selected.item}
							onChange={(next) =>
								updateItem(selected.track.id, selected.item.id, next)
							}
							onDelete={() => deleteItem(selected.track.id, selected.item.id)}
						/>
					</>
				) : (
					<p style={{ color: "var(--muted)" }}>
						Select an item on the timeline to edit it.
					</p>
				)}
			</aside>

			{/* Timeline */}
			<footer
				style={{
					gridColumn: "1 / 3",
					borderTop: "1px solid var(--line)",
					background: "var(--panel)",
					padding: "6px 14px 14px",
					maxHeight: "38vh",
					overflow: "auto",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 10,
						marginBottom: 4,
					}}
				>
					<span style={{ color: "var(--muted)" }}>timeline</span>
					<button
						type="button"
						onClick={() => setPxPerFrame((z) => Math.max(0.25, z / 1.5))}
					>
						−
					</button>
					<button
						type="button"
						onClick={() => setPxPerFrame((z) => Math.min(20, z * 1.5))}
					>
						+
					</button>
					<div style={{ flex: 1 }} />
					<span style={{ color: "var(--muted)" }}>{status}</span>
				</div>
				<TimelineStrip
					project={project}
					selection={selection}
					pxPerFrame={pxPerFrame}
					onSelect={setSelection}
					onMoveItem={moveItemFrom}
				/>
			</footer>
		</div>
	);
}

const rootEl = document.getElementById("root");
if (rootEl) {
	createRoot(rootEl).render(<App />);
}
