---
system: "autocaption"
type: dependencies
version: 1
lastUpdated: "2026-05-26"
lastUpdatedBy: claude-build
---

# Dependencies — autoCaption

## Runtime Dependencies (npm)

| Dependency | Version | Purpose |
|-----------|---------|---------|
| remotion | ^4.0.438 | Programmatic video composition runtime (the `<Composition>`, `<Sequence>`, `<Video>`, `<AbsoluteFill>`, `staticFile`, `delayRender` primitives used by `CaptionedVideo`) |
| @remotion/cli | ^4.0.438 | `remotion` CLI for the `studio` script and config loader (`@remotion/cli/config`) |
| @remotion/renderer | ^4.0.438 | `selectComposition` + `renderMedia` used by `render.ts` to produce the final MP4 |
| @remotion/bundler | ^4.0.438 | `bundle()` used by `render.ts` to compile the Remotion entry point before rendering |
| @remotion/captions | ^4.0.438 | `Caption` type and `createTikTokStyleCaptions` page-grouping helper used by `CaptionOverlay` |
| @remotion/install-whisper-cpp | ^4.0.438 | `installWhisperCpp` and `downloadWhisperModel` — fetches and compiles Whisper.cpp v1.5.5 plus the requested ggml model into `./whisper.cpp` |
| @remotion/google-fonts | ^4.0.438 | `Inter` font loader used by `CaptionPage` |
| react | ^19.2.4 | Required by Remotion components |
| react-dom | ^19.2.4 | Required by Remotion's render pipeline |
| zod | ^4.3.6 | Schema validation for `CaptionStyleSchema` (`src/config.ts`) and `RenderOptionsSchema` (`src/render.ts`) |

## Build / Dev Dependencies

| Dependency | Version | Purpose |
|-----------|---------|---------|
| typescript | ^5.9.3 | TypeScript compiler used by `bun run typecheck` (`tsc --noEmit`) |
| @types/bun | latest | Bun ambient type declarations |
| @types/react | ^19.2.14 | React type declarations |
| @types/react-dom | ^19.2.3 | React DOM type declarations |
| @biomejs/biome | ^2.4.8 | Linter and formatter for `src/` and `tests/` (`bun run lint`, `bun run format`) |
| vitest | ^4.1.0 | Test runner powering `bun test` |

## External System Dependencies

| Dependency | Source | Purpose | Failure Impact |
|-----------|--------|---------|---------------|
| Bun | https://bun.sh (v1.0+) | JavaScript runtime and package manager that executes `src/cli.ts` directly | CLI cannot start at all |
| ffmpeg | system PATH | Extracts 16 kHz mono PCM `s16le` audio from the input video (`execFileSync` in `transcribe.ts`) | `transcribeVideo` raises ENOENT; pipeline halts before Whisper runs |
| Whisper.cpp binary (`main`) | downloaded by `@remotion/install-whisper-cpp` into `./whisper.cpp` at version 1.5.5 | Performs local speech-to-text with word-level (token) timestamps | Transcription fails; pipeline halts before render |
| ggml Whisper model file (`ggml-<model>.bin`) | downloaded by `@remotion/install-whisper-cpp` into `./whisper.cpp` | Model weights for the selected Whisper size (`tiny.en` through `large-v3-turbo`) | Transcription fails; pipeline halts before render |
| Network access to Hugging Face / GitHub | required on first run only | Used by `installWhisperCpp` and `downloadWhisperModel` to fetch the binary and model files | First run fails; cached binary + model survive across subsequent offline runs |

## Working Directory Artifacts
autoCaption writes into `process.cwd()` rather than a system cache. Operators running it from monorepo automation should expect these to appear and may want to scope CWD per run:

| Path | Created by | Purpose |
|------|-----------|---------|
| `whisper.cpp/` | `installWhisperCpp` | Holds the compiled `main` binary and any downloaded `ggml-*.bin` model files |
| `public/` | `cli.ts` | Remotion `staticFile()` root for the render; holds a copy of the input video and (transiently) `captions.json` |
| `<input>_captioned<ext>` | `renderMedia` | Default location of the final captioned video, next to the input file |

## In-Monorepo Relationships
autoCaption is a standalone git submodule (`https://github.com/Dragon-hearted/autoCaption.git`) registered in the parent `systems.yaml` at `systems/autoCaption`. It has no direct code imports from sibling systems. It does share a Remotion 4 / React 19 / Bun toolchain shape with `systems/scene-board`, which means upgrades to Remotion in one are a useful regression signal for the other but the two repos do not coordinate at build time.

## Environment Variables
None required. autoCaption is configured entirely through CLI flags and Zod-validated defaults; there are no environment-driven knobs in `cli.ts`, `transcribe.ts`, `render.ts`, or `config.ts`.
