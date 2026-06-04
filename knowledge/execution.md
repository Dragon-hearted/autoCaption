---
system: "autocaption"
type: execution
driver: cli
entry: "just render <video-path> [-m <model>] [--font-size <px>] [--position <top|center|bottom>] [--highlight-color <hex>] [-o <out.mp4>]"
mode: orchestrate
gates: executor
version: 1
lastUpdated: "2026-06-04"
lastUpdatedBy: build-mode
---

# Execution — autoCaption

How Execute Mode (`/adcelerate-execute`) runs this system. Execute Mode reads ONLY this manifest to decide how to run, then branches on `driver`.

## Invocation
Run the CLI (equivalently `bun run src/cli.ts <video-path> [flags]`). Requires `ffmpeg` on PATH. A single invocation runs all three stages in order:

```
just render <video-path> -m <model> --font-size <px> --position <bottom|center|top> --highlight-color <hex> -o <out.mp4>
```

## Natural flow (awareness only — the system drives this on the skill path)
1. **transcription** — `transcribeVideo()` runs Whisper.cpp on the extracted audio, producing a `Caption[]` array with word-level timestamps (`public/captions.json`). Model defaults to `medium.en`.
2. **caption-styling** — the CLI styling flags are validated into a `CaptionStyle` (Zod) — `--font-size` (default 80), `--position` (default bottom), `--highlight-color` (default `#39E508`).
3. **rendering** — `renderVideo()` composites the captions over the video via Remotion, producing the final 1080×1920 h264 MP4 (`--srt-only` skips render and emits `.srt` instead).

## Where the agent must check / supply input
- **transcription** — supply the **input video path** (required) and optionally the **Whisper model** (`-m`); first run of a model downloads its weights.
- **caption-styling** — approve/supply the **style flags** (`--font-size`, `--position`, `--highlight-color`) before rendering, or accept defaults.
- **rendering** — supply the **output path** (`-o`, defaults to `<input>_captioned.mp4`); choose `--srt-only` if no rendered video is wanted.

## Validation
After execution, validate the output against [acceptance-criteria.md](acceptance-criteria.md) (hard gates inline, soft criteria via the validator). Applies to both drivers.
