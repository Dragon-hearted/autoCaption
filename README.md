<div align="center">

![AutoEditor](images/hero.svg)

### Word-highlighted caption renderer for vertical video

![Status](https://img.shields.io/badge/Status-active-brightgreen)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000)
![Remotion](https://img.shields.io/badge/Remotion-4-0B84F3?logo=remotion&logoColor=white)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?logo=bun&logoColor=000)](https://bun.sh/)

</div>

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🏗 Architecture](#-architecture)
- [🛠 Tech Stack](#-tech-stack)
- [🚀 Getting Started](#-getting-started)
- [🚀 Usage](#-usage)
- [💻 Development](#-development)
- [📂 Project Structure](#-project-structure)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Word-level transcription** | Whisper.cpp runs with --output-json-full to emit per-token timestamps; whisperSegmentsToCaptions() projects every token into a Remotion Caption, enabling true per-word timing (falls back to per-segment when token offsets are absent). |
| **TikTok-style word highlighting** | createTikTokStyleCaptions groups tokens into on-screen pages; CaptionPage colors the currently-spoken word with highlightColor (#39E508 default) and inactive words with textColor (#FFFFFF), driven by useCurrentFrame(). |
| **Vertical 1080x1920 H.264 render** | The CaptionedVideo Remotion composition burns captions over the original footage and renders MP4/H.264 at 1080x1920 (9:16), 30 fps, JPEG frames; existing output is overwritten (Config.setOverwriteOutput(true)). |
| **Configurable caption style (Zod)** | CaptionStyleSchema validates fontSize (80), fontFamily (Inter via @remotion/google-fonts), highlightColor (#39E508), textColor (#FFFFFF), position (top\|center\|bottom), bold (true), and combineTokensWithinMs (1200) for page grouping. |
| **SRT subtitle export** | --srt-only writes a standards-compliant .srt subtitle file (HH:MM:SS,mmm cues grouped the same way the renderer pages them) next to the output and skips the Remotion render entirely. |
| **Captions JSON output** | Every run writes public/captions.json (a pretty-printed array of Caption objects); --keep-captions preserves it after render instead of deleting it. |
| **12-model Whisper catalog** | Selectable via -m/--model: tiny, tiny.en, base, base.en, small, small.en, medium, medium.en, large-v1, large-v2, large-v3, large-v3-turbo (default medium.en). English-only *.en variants trade multilingual support for English accuracy. |
| **Auto whisper.cpp install + model download** | @remotion/install-whisper-cpp compiles whisper.cpp 1.5.5 into ./whisper.cpp and downloads ggml-<model>.bin on first run — no manual build step needed. |
| **ffmpeg audio extraction** | extractAudio() invokes ffmpeg to convert the input to 16 kHz mono PCM s16le WAV in the OS temp dir before transcription; the temp WAV is always cleaned up. |
| **Remotion Studio preview** | bun run studio (just dev) opens the Remotion Studio for the CaptionedVideo composition to preview/iterate on caption styling interactively. |
| **Local-first / offline** | No API keys, gateways, or cloud calls — all transcription and rendering run on-device. Only first-run whisper.cpp/model download needs internet. |
| **Hand-rolled CLI flag parser** | parseArgs validates the input file exists and exposes -o/--output, -m/--model, --srt-only, --keep-captions, --font-size, --position, --highlight-color, and -h/--help with clear error messages. |

---

## 🏗 Architecture

![Pipeline](images/pipeline.svg)

AutoEditor processes data through a multi-stage pipeline.

---

## 🛠 Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **Remotion CLI 4** | Remotion CLI |
| **Remotion Renderer 4** | Remotion server-side renderer |
| **React 19** | UI framework |
| **React-dom 19** | React DOM renderer |
| **Remotion 4** | Programmatic video rendering |
| **Remotion Bundler 4** | Remotion bundler |

### Backend

| Technology | Purpose |
|------------|---------|
| **TypeScript 5.9** | Type safety |
| **Bun** | JavaScript runtime & package manager |
| **Zod 4** | Schema validation |

---

## 🚀 Getting Started

### Prerequisites

- Bun v1.0+ — curl -fsSL https://bun.sh/install | bash
- ffmpeg on PATH — brew install ffmpeg (macOS) / apt install ffmpeg (Linux)
- A C/C++ toolchain — whisper.cpp 1.5.5 is compiled from source on first run (Xcode Command Line Tools on macOS, build-essential on Linux)
- Internet access on first run — downloads whisper.cpp source and the selected ggml model (~75 MB for tiny.en up to ~3 GB for large-v3)
- Free disk space for ./whisper.cpp (compiled binary + model) and ./public (a copy of the input video + captions.json)

### Install

```bash
cd systems/auto-editor
bun install
```

---

## 🚀 Usage

### 1. View CLI help and the model catalog

```bash
bun run src/cli.ts --help
```

> **Expected:** Prints usage, all options, and the 12 valid Whisper models. Note: --help exits with code 1 (help text is thrown as an error).

### 2. Caption a video (full pipeline)

```bash
bun run src/cli.ts input.mp4
```

> **Expected:** Transcribes input.mp4, writes public/captions.json, renders input_captioned.mp4 (1080x1920, H.264, 30 fps). First run compiles whisper.cpp and downloads the medium.en model (requires ffmpeg + whisper model — heavy first-run download).

### 3. Export SRT subtitles only (no render)

```bash
bun run src/cli.ts input.mp4 --srt-only --keep-captions
```

> **Expected:** Writes input.srt (and keeps public/captions.json), then exits without rendering. Verified end-to-end on a generated test clip with --model tiny.en: ffmpeg extracted audio, whisper.cpp 1.5.5 compiled + ggml-tiny.en.bin downloaded, 'Found 7 captions', valid .srt cues written (exit 0).

### 4. Pick a Whisper model

```bash
bun run src/cli.ts input.mp4 -m large-v3-turbo
```

> **Expected:** Downloads ggml-large-v3-turbo.bin on first use and transcribes with it (requires whisper model download — ~1.5 GB).

### 5. Customize caption styling

```bash
bun run src/cli.ts input.mp4 --position top --font-size 64 --highlight-color "#FF0066"
```

> **Expected:** Renders captions anchored to the top, 64 px font, with the spoken word highlighted in #FF0066 (requires ffmpeg + whisper model).

### 6. Set a custom output path

```bash
bun run src/cli.ts input.mp4 -o out/final.mp4
```

> **Expected:** Writes the captioned video to out/final.mp4 instead of the default <input>_captioned.mp4 (requires ffmpeg + whisper model).

### 7. Preview / iterate styling in Remotion Studio

```bash
bun run studio
```

> **Expected:** Opens the Remotion Studio on the CaptionedVideo composition for interactive preview (alias: just dev).

### 8. Run the test suite

```bash
bun run test
```

> **Expected:** Runs vitest: 68 tests pass, 2 skipped across 5 files (captions, cli, render, srt, transcribe).

### Command Reference

| Command | Description |
|---------|-------------|
| `bun run src/cli.ts <video> [options]` | Transcribe and render a captioned vertical video (primary entry point). |
| `-o, --output <path>` | Output path (default: <input>_captioned.mp4). |
| `-m, --model <model>` | Whisper model (default: medium.en). One of the 12 in VALID_MODELS. |
| `--srt-only` | Write an .srt subtitle file only; skip the Remotion render. |
| `--keep-captions` | Keep public/captions.json after the run instead of deleting it. |
| `--font-size <size>` | Caption font size in px (default: 80). |
| `--position <pos>` | Caption anchor: top, center, or bottom (default: bottom). |
| `--highlight-color <hex>` | Color of the currently spoken word (default: #39E508). |
| `-h, --help` | Show usage, options, and the valid model list. |
| `bun run studio  (just dev)` | Open Remotion Studio to preview the CaptionedVideo composition. |
| `bun run test  (just test)` | Run the vitest suite. |
| `bun run lint  /  bun run format  /  bun run typecheck` | Biome lint, Biome format-write, and tsc --noEmit checks. |

---

## 💻 Development

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development mode |
| `bun run build` | Build for production |
| `bun test` | Run tests |
| `bun run lint` | Check code quality |

---

## 📂 Project Structure

```
auto-editor/
├── README.md
├── biome.json
├── images
│   ├── hero.svg
│   └── pipeline.svg
├── justfile
├── knowledge
│   ├── acceptance-criteria.md
│   ├── dependencies.md
│   ├── domain.md
│   └── scope.md
├── package.json
├── remotion.config.ts
├── src
│   ├── captions
│   │   ├── CaptionOverlay.tsx
│   │   └── CaptionPage.tsx
│   ├── cli.ts
│   ├── compositions
│   │   ├── CaptionedVideo.tsx
│   │   └── Root.tsx
│   ├── config.ts
│   ├── render.ts
│   ├── srt.ts
│   └── transcribe.ts
├── tests
│   ├── captions.test.ts
│   ├── cli.test.ts
│   ├── render.test.ts
│   ├── setup.ts
│   ├── srt.test.ts
│   └── transcribe.test.ts
└── tsconfig.json
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and ensure tests pass
4. Commit your changes and open a pull request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**Built with** 🧡 **using Bun, React, Remotion, TypeScript**

</div>
