---
system: "autocaption"
type: scope
version: 1
lastUpdated: "2026-05-26"
lastUpdatedBy: claude-build
---

# autoCaption — Scope

## Description
CLI-driven word-highlighted caption renderer for short-form vertical video. Whisper.cpp transcribes the source audio into word-level timestamped captions, and a Remotion composition paints TikTok-style overlays back onto the video with per-word color highlighting synced to the spoken word.

## In Scope
- Local audio transcription via Whisper.cpp with word-level (token) timestamps
- Whisper model selection across the full ggml model set (`tiny` through `large-v3-turbo`)
- Automatic Whisper.cpp install and model download into a local `whisper.cpp/` working directory
- Audio extraction from video via `ffmpeg` (16 kHz mono PCM `s16le`)
- Caption styling: font size, position (top / center / bottom), highlight color, text color, bold weight, token grouping window
- Programmatic Remotion bundle + render of the `CaptionedVideo` composition
- Vertical 1080×1920 @ 30fps H.264 MP4 output (default)
- Optional SRT-only mode (transcribe and emit `captions.json`, skip render)
- Optional preservation of intermediate `captions.json` for downstream tooling
- Validated render options via Zod (`RenderOptionsSchema`, `CaptionStyleSchema`)

## Out of Scope
- HTTP / server interface (CLI only)
- Cloud / hosted transcription providers (Whisper.cpp local binary only)
- Translation of captions into other languages
- Speaker diarization or multi-speaker labelling
- Burned-in graphics beyond the caption overlay (logos, lower thirds, B-roll)
- Multi-track audio mixing or audio post-processing
- Aspect ratios other than 9:16 1080×1920 at the composition level
- Authentication, multi-user state, or persistence across runs

## Inputs
- Path to a video file (any container `ffmpeg` can read)
- Whisper model identifier (default `medium.en`)
- Optional output path (default `<input>_captioned.<ext>`)
- Optional style overrides: `--font-size`, `--position`, `--highlight-color`
- Mode flags: `--srt-only`, `--keep-captions`

## Outputs
- Captioned MP4 video file at the resolved output path (H.264, 1080×1920, 30fps)
- `public/captions.json` — array of `Caption` objects (`{ text, startMs, endMs, timestampMs, confidence }`)
- A copy of the source video staged into `public/<basename>` for Remotion `staticFile()` access
- Stdout progress lines: transcription summary, bundling %, rendering %
- Non-zero exit code on missing input file, invalid model, Whisper failure, or render failure
