# Relay

Relay is an original, local-first Windows desktop app for keeping useful project context while moving between AI tools. It supports local Claude Code and Codex session discovery, plus a free web handoff flow for Claude, ChatGPT, Gemini, and Perplexity without provider API keys.

[![Release](https://img.shields.io/badge/desktop-1.4.0-82f4ca)](https://relay-download.skljskl.chatgpt.site)
[![Extension](https://img.shields.io/badge/extension-0.4.1-a98cff)](website/Relay-Extension-0.4.1.zip)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Chrome%20%7C%20Edge-15171a)](#run-locally)

**Switch the AI. Keep the thread.**

[Download Relay](https://relay-download.skljskl.chatgpt.site) · [Meet the creator](https://relay-download.skljskl.chatgpt.site/about.html) · [Extension guide](extension/README.md)

## What it includes

- Electron tray app with a React + Vite interface
- Global `Ctrl+Shift+Space` launcher
- Local Claude Code and Codex session discovery
- Resume, search, rename, pin, tags, and notes
- Free web handoff composer with reusable local memory
- Focus Queue, usage insights, backup/restore, and diagnostics
- Windows NSIS installer packaging
- Standalone download website in [`website/`](website/)
- Chrome/Edge continuity extension in [`extension/`](extension/)

## Project structure

```text
Relay-ai/
├── assets/             App icons and bundled assets
├── extension/          Chrome/Edge Manifest V3 extension
├── src/                React renderer
├── tests/              Node and Electron smoke tests
├── website/            Public download dashboard
├── main.js             Electron main process
├── preload.js          Secure renderer bridge
├── sessions.js         Local session discovery and persistence
├── index.html          Vite entry document
├── vite.config.js      Renderer build configuration
└── package.json        Scripts and Windows packaging config
```

`creo-main` is not part of this repository. Relay's code, interface, and product identity are maintained independently.

## Run locally

Requirements: Windows 10/11 and Node.js 18 or newer.

```powershell
npm install
npm run dev
```

For the packaged-style Electron run:

```powershell
npm run build:renderer
npm start
```

## Verify

```powershell
npm run check
npm test
```

## Build the Windows installer

```powershell
npm run build
```

The generated installer is written to `release/` and intentionally excluded from Git. Distribute installers through GitHub Releases or the hosted download dashboard instead of committing binaries to source control.

## Try the browser extension

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the repository's `extension` folder. Relay then appears inside Claude, ChatGPT, Gemini, and Perplexity. See [`extension/README.md`](extension/README.md) for details.

## Current release

- Version: `1.4.0`
- Browser extension: `0.4.1`
- Platform: Windows x64
- Installer SHA-256: `94F75375640C723F00856F548B30D0590C14D41354941F060929800C54D3BAD7`
- Download dashboard: <https://relay-download.skljskl.chatgpt.site>

## Creator

Relay is designed and built by [Vikash Kumar](https://github.com/vikashkumar302004) as an independent, local-first continuity tool for people who work across multiple AI providers.
