---
system: "auto-editor"
type: acceptance-criteria
version: 1
lastUpdated: "2026-05-26"
lastUpdatedBy: claude-build
---

# AutoEditor — Acceptance Criteria

## Hard Gates

### CLI & Argument Handling
- [ ] `bun run src/cli.ts --help` (or `-h`) prints usage and exits without running the pipeline
- [ ] CLI exits non-zero with "No video path provided" when no positional video path is supplied
- [ ] CLI exits non-zero with "Video file not found: <path>" when the supplied video path does not exist on disk
- [ ] `parseArgs` recognizes `-o`/`--output`, `-m`/`--model`, `--srt-only`, `--keep-captions`, `--font-size`, `--position`, `--highlight-color`
- [ ] Default model is `medium.en` when `--model` is omitted
- [ ] Default style is `fontSize=80`, `position="bottom"`, `highlightColor="#39E508"` when overrides are omitted

### Transcription
- [ ] `transcribeVideo` rejects any model identifier not in `VALID_MODELS` with "Invalid model: <model>"
- [ ] `transcribeVideo` calls `installWhisperCpp` so the `whisper.cpp/main` binary exists before invocation
- [ ] `transcribeVideo` calls `downloadWhisperModel` so `ggml-<model>.bin` exists before invocation
- [ ] Audio is extracted with `ffmpeg` to 16 kHz mono `pcm_s16le` before being passed to Whisper
- [ ] Whisper is invoked with `--output-json-full` and a 300 s timeout
- [ ] Output `Caption[]` contains one entry per Whisper token (word-level timestamps), not just one per segment, whenever `tokens[]` is populated
- [ ] Empty / whitespace-only tokens are skipped (except a literal space `" "`)
- [ ] The temp WAV is always unlinked after `transcribeVideo` completes, success or failure
- [ ] Whisper non-zero exit surfaces as `Error: Whisper transcription failed: <stderr>`
- [ ] Missing JSON output surfaces as `Error: Whisper did not produce JSON output`

### Captions JSON
- [ ] `writeCaptionsJson` serializes captions to disk as a top-level JSON array with two-space indentation
- [ ] Each persisted caption has `text`, `startMs`, `endMs`, `timestampMs`, and `confidence` fields
- [ ] `captions.json` is written under `public/` in `process.cwd()`; the directory is created if missing
- [ ] The source video is copied (not moved) into `public/<basename>` so Remotion `staticFile()` can resolve it
- [ ] When `--keep-captions` is passed, `captions.json` is left on disk after a successful render
- [ ] When `--keep-captions` is omitted, `captions.json` is unlinked after a successful render

### Render
- [ ] `renderVideo` validates options via `RenderOptionsSchema` (Zod) and throws on schema violations
- [ ] Default `compositionId` is `"CaptionedVideo"`
- [ ] Default codec is `h264`
- [ ] Default output path is `<input>_captioned<ext>` derived via `getOutputPath`
- [ ] Custom output path passed via `-o`/`--output` is honored verbatim
- [ ] Render output is 1080 × 1920 at 30 fps (composition contract)
- [ ] Existing files at the output path are overwritten (no prompt) — `Config.setOverwriteOutput(true)`
- [ ] `--srt-only` mode writes `captions.json` and exits cleanly without bundling or rendering
- [ ] `onProgress` is invoked with stage `"bundling"` during bundle and `"rendering"` during render

### Overlay Behaviour
- [ ] `CaptionOverlay` groups tokens into pages via `createTikTokStyleCaptions` using `combineTokensWithinMs`
- [ ] Each page is rendered inside its own `<Sequence>` with `from` and `durationInFrames` derived from page `startMs`
- [ ] The currently spoken token (where `token.fromMs <= currentMs < token.toMs`) is colored with `style.highlightColor`
- [ ] Non-active tokens within the same page are colored with `style.textColor`
- [ ] `style.position` controls vertical alignment: `top` → `flex-start`, `center` → `center`, `bottom` → `flex-end`
- [ ] Captions are loaded via `delayRender` / `continueRender`; a fetch failure calls `cancelRender(error)` so the render fails loudly

### Code Quality
- [ ] `bun run typecheck` (i.e. `tsc --noEmit`) passes with zero errors
- [ ] `bun run lint` (Biome) passes with zero errors
- [ ] `bun test` passes (covers `cli`, `transcribe`, `render`, and `captions`)
