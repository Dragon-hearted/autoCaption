<div align="center">

![autoCaption](images/hero.svg)

### Automated video captioning system using Whisper.cpp for transcription and Remotion for rendering TikTok-style word-highlighted captions onto vertical video

![Status](https://img.shields.io/badge/Status-active-brightgreen)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=000)
![Remotion](https://img.shields.io/badge/Remotion-4-0B84F3?logo=remotion&logoColor=white)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?logo=bun&logoColor=000)](https://bun.sh/)

</div>

---

## 📑 Table of Contents

- [✨ Features](#features)
- [🏗 Architecture](#architecture)
- [🛠 Tech Stack](#tech-stack)
- [🚀 Getting Started](#getting-started)
- [💻 Development](#development)
- [📂 Project Structure](#project-structure)
- [🤝 Contributing](#contributing)
- [📄 License](#license)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **video-captioning** | Core task type |
| **transcription** | Core task type |
| **subtitle-generation** | Core task type |
| **video-file Input** | Supported input type |
| **captioned-video Output** | Supported output type |
| **captions-json Output** | Supported output type |

---

## 🏗 Architecture

![Pipeline](images/pipeline.svg)

autoCaption processes data through a multi-stage pipeline.

---

## 🛠 Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **@remotion/cli 4** | Remotion CLI |
| **React 19** | UI framework |
| **React-dom 19** | React DOM renderer |
| **Remotion 4** | Programmatic video rendering |

### Backend

| Technology | Purpose |
|------------|---------|
| **TypeScript 5.9** | Type safety |
| **Bun** | JavaScript runtime & package manager |
| **Zod 4** | Schema validation |

---

## 🚀 Getting Started

### Prerequisites

- [**Bun**](https://bun.sh/) v1.0+ — `curl -fsSL https://bun.sh/install | bash`

### Install

```bash
cd systems/autoCaption
bun install
```

### Run

```bash
bun run systems/autoCaption/src/cli.ts
```

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
autoCaption/
├── README.md
├── biome.json
├── images
│   ├── hero.svg
│   └── pipeline.svg
├── justfile
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
│   └── transcribe.ts
├── tests
│   ├── captions.test.ts
│   ├── cli.test.ts
│   ├── render.test.ts
│   ├── setup.ts
│   └── transcribe.test.ts
├── tsconfig.json
└── vendor
    └── design-system
        └── tokens.css
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
