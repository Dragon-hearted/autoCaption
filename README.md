# autoCaption

Automatically transcribe and render TikTok-style captions onto videos using Whisper.cpp and Remotion.

## What It Does

1. Transcribes speech from a video file using [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
2. Generates word-level timed captions
3. Renders captions directly onto the video with customizable styling (highlight color, font size, position)
4. Outputs a new video file with burned-in captions

## Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [FFmpeg](https://ffmpeg.org) (for audio extraction)
- Disk space for Whisper models (~75MB for tiny, ~1.5GB for large)

## Installation

```bash
bun install
```

Whisper.cpp and the selected model are downloaded automatically on first run.

## Usage

```bash
# Basic usage — transcribe and render captions
bun run src/cli.ts video.mp4

# Specify output path
bun run src/cli.ts video.mp4 --output captioned.mp4

# Use a different Whisper model
bun run src/cli.ts video.mp4 --model base.en

# Generate captions JSON only (no video render)
bun run src/cli.ts video.mp4 --srt-only

# Keep captions JSON after rendering
bun run src/cli.ts video.mp4 --keep-captions

# Customize caption appearance
bun run src/cli.ts video.mp4 \
  --font-size 100 \
  --position top \
  --highlight-color "#FF0000"
```

### Options

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--output <path>` | `-o` | `<input>_captioned.mp4` | Output video path |
| `--model <model>` | `-m` | `medium.en` | Whisper model to use |
| `--srt-only` | | `false` | Generate captions only, skip render |
| `--keep-captions` | | `false` | Keep captions JSON after render |
| `--font-size <n>` | | `80` | Caption font size |
| `--position <pos>` | | `bottom` | Caption position: `top`, `center`, `bottom` |
| `--highlight-color <hex>` | | `#39E508` | Active word highlight color |
| `--help` | `-h` | | Show help |

### Available Models

`tiny`, `tiny.en`, `base`, `base.en`, `small`, `small.en`, `medium`, `medium.en`, `large-v1`, `large-v2`, `large-v3`, `large-v3-turbo`

English-only models (`.en` suffix) are faster and more accurate for English content.

## Development

```bash
# Run tests
bun run test

# Run tests in watch mode
bun run test:watch

# Lint
bun run lint

# Type check
bun run typecheck

# Format code
bun run format

# Open Remotion Studio (preview compositions)
bun run studio
```

## Project Structure

```
src/
  cli.ts              # CLI entry point and arg parsing
  transcribe.ts       # Whisper.cpp transcription pipeline
  render.ts           # Remotion programmatic renderer
  config.ts           # Caption style schema (Zod)
  compositions/
    Root.tsx           # Remotion root composition
    CaptionedVideo.tsx # Video + caption overlay composition
  captions/
    CaptionOverlay.tsx # TikTok-style caption page sequencer
    CaptionPage.tsx    # Single caption page renderer
tests/
  setup.ts            # Test fixtures and helpers
  cli.test.ts         # CLI and integration tests
  transcribe.test.ts  # Transcription pipeline tests
  captions.test.ts    # Caption processing tests
  render.test.ts      # Render pipeline tests
```

## Roadmap

- SRT/VTT file export
- Multiple caption style presets (karaoke, subtitle, pop)
- Font selection via Google Fonts
- GPU-accelerated rendering
- Batch processing (multiple videos)
- Caption editing UI via Remotion Studio
- Language auto-detection and translation
