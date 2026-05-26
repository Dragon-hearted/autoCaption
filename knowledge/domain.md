---
system: "autocaption"
type: domain
version: 1
lastUpdated: "2026-05-26"
lastUpdatedBy: claude-build
---

# autoCaption — Domain Knowledge

## Overview
autoCaption is a local-first CLI that turns any video into a captioned vertical video. The pipeline runs Whisper.cpp against the extracted audio, converts Whisper's per-token output into Remotion `Caption` objects, and renders a `CaptionedVideo` Remotion composition that overlays TikTok-style per-word highlights on top of the original footage.

## Core Concepts

### Caption
A single timestamped text unit, conforming to `@remotion/captions`' `Caption` type:
```
{ text: string; startMs: number; endMs: number; timestampMs: number; confidence: number | null }
```
autoCaption emits one `Caption` per Whisper *token* when token-level timestamps are available, falling back to one per segment otherwise. This is what unlocks per-word highlighting in the overlay.

### Word-Level Timestamp
Whisper.cpp invoked with `--output-json-full` produces a `transcription[]` array where each segment carries a `tokens[]` field with `offsets.from` / `offsets.to` in milliseconds. `whisperSegmentsToCaptions()` walks every token, skips empty whitespace, and projects each into a `Caption`. These millisecond offsets become the timing source for the overlay.

### Caption Style
Validated by `CaptionStyleSchema` (Zod) in `src/config.ts`:
- `fontSize` (default 80)
- `fontFamily` (default `Inter`, loaded via `@remotion/google-fonts/Inter`)
- `highlightColor` (default `#39E508`) — color of the currently spoken word
- `textColor` (default `#FFFFFF`) — color of inactive words on the page
- `position` (`top` | `center` | `bottom`, default `bottom`)
- `bold` (default `true`)
- `combineTokensWithinMs` (default `1200`) — window used by `createTikTokStyleCaptions` to group tokens into pages

### Remotion Composition
Single composition `CaptionedVideo` registered in `src/compositions/Root.tsx`:
- `width: 1080`, `height: 1920`, `fps: 30`, `durationInFrames: 30 * 60`
- Props: `videoSrc`, `captionsPath`, optional `style`
- Loads `captions.json` via `fetch(staticFile(captionsPath))` inside a `delayRender` handle, then renders `<Video>` plus `<CaptionOverlay>` inside an `<AbsoluteFill>`.

### TikTok-Style Pages
`CaptionOverlay` calls `createTikTokStyleCaptions({ captions, combineTokensWithinMilliseconds })` to bucket consecutive tokens into "pages" (the unit displayed on screen at once). Each page becomes a Remotion `<Sequence>` whose `from` and `durationInFrames` are derived from page `startMs` and the next page's `startMs`, clamped by `combineTokensWithinMs`. `CaptionPage` then renders the page's tokens and uses `useCurrentFrame()` to color the active token with `highlightColor`.

## Pipeline Stages

### 1. Argument Parsing (`cli.ts → parseArgs`)
Hand-rolled flag parser. Validates the input file exists and the model is supported (validation against `VALID_MODELS` happens later inside `transcribeVideo`). Throws on missing video path or unknown `--help`.

### 2. Transcription (`transcribe.ts → transcribeVideo`)
1. `ensureWhisperCpp()` — `installWhisperCpp` from `@remotion/install-whisper-cpp` into `./whisper.cpp` at version `1.5.5`.
2. `ensureModel(model)` — `downloadWhisperModel` into the same folder; produces `ggml-<model>.bin`.
3. `extractAudio(videoPath, tempWav)` — `execFileSync('ffmpeg', ['-i', videoPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', tempWav, '-y'])`.
4. `spawnSync(WHISPER_PATH/main, ['-m', modelFile, '-f', tempWav, '--output-json-full', '-of', tempJson], { timeout: 300_000 })`.
5. Parse `${tempJson}.json`, walk `transcription[].tokens[]`, emit `Caption[]`.
6. Always unlink the temp WAV in a `finally`; unlink the JSON after parse.

### 3. Staging (`cli.ts`)
- Create `public/` next to the cwd if missing.
- Write the parsed captions to `public/captions.json` (`writeCaptionsJson`).
- Copy the source video to `public/<basename>` so Remotion's `staticFile()` can resolve it during render.

### 4. Rendering (`render.ts → renderVideo`)
1. Validate options via `RenderOptionsSchema` (Zod).
2. `bundle({ entryPoint: 'compositions/Root.tsx' })` from `@remotion/bundler`; `onProgress` fires as stage `"bundling"`.
3. `selectComposition({ serveUrl, id: 'CaptionedVideo', inputProps })` from `@remotion/renderer`.
4. `renderMedia({ composition, serveUrl, codec: 'h264', outputLocation, inputProps, onProgress })`; progress fires as stage `"rendering"`.
5. Returns the final output path.

### 5. Cleanup (`cli.ts`)
Unless `--keep-captions` was passed, `captions.json` is unlinked after a successful render.

## File / Path Conventions
- `whisper.cpp/` — created in `process.cwd()`; holds the compiled `main` binary and `ggml-<model>.bin` files.
- `public/` — created in `process.cwd()`; Remotion's static-file root for render. Always contains a copy of the input video (under its original basename) and (during render) `captions.json`.
- Temp files — written under `os.tmpdir()` with `autocaption_<Date.now()>` prefixes; the WAV is always cleaned up, the JSON is cleaned up on success.
- Default output — `<input>_captioned<ext>` next to the input video (`getOutputPath`).

## Output Format
- Container / codec: MP4 / H.264 (`codec` is overridable via `RenderOptions.codec` but the CLI does not expose a flag).
- Resolution: 1080 × 1920 (vertical 9:16), fixed by the `CaptionedVideo` composition.
- Frame rate: 30 fps.
- Image format during render: JPEG frames (`Config.setVideoImageFormat("jpeg")` in `remotion.config.ts`).
- `Config.setOverwriteOutput(true)` — existing output files at the target path are overwritten without prompting.
- `captions.json` shape: a top-level JSON array of `Caption` objects, pretty-printed with two-space indentation.

## Whisper Model Catalog
`VALID_MODELS` (in order): `tiny`, `tiny.en`, `base`, `base.en`, `small`, `small.en`, `medium`, `medium.en`, `large-v1`, `large-v2`, `large-v3`, `large-v3-turbo`. English-only variants (`*.en`) trade multilingual capability for accuracy on English audio.

## Failure Modes
- Missing video path → `parseArgs` throws "No video path provided".
- Input file does not exist → `parseArgs` and `transcribeVideo` both throw "Video file not found".
- Unknown model → `transcribeVideo` throws "Invalid model".
- `ffmpeg` not on PATH → `execFileSync` raises ENOENT.
- Whisper exit code != 0 → "Whisper transcription failed: <stderr>".
- Whisper produced no JSON → "Whisper did not produce JSON output".
- Whisper exceeds 300 s timeout → `spawnSync` returns with non-zero status; surfaced as the failure above.
- Captions fetch fails inside the composition → `cancelRender` is invoked, render aborts.
