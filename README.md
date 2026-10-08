<div align="center">

# ⚡ Relay

### Switch the AI. Keep the thread.

Relay is a local-first browser extension and Windows companion that carries useful working context between Claude, ChatGPT, Gemini, and Perplexity—without asking you to explain the same task again.

[Download Extension v0.5.6](https://github.com/vikashkumar302004/Relay-ai/raw/refs/heads/main/website/Relay-Extension-0.5.6.zip) · [Open Website](https://vikashkumar302004.github.io/Relay-ai/) · [Meet the Creator](https://vikashkumar302004.github.io/Relay-ai/about.html)

![Extension](https://img.shields.io/badge/Extension-v0.5.6-a98cff?style=for-the-badge)
![Desktop](https://img.shields.io/badge/Desktop-v1.4.0-82f4ca?style=for-the-badge)
![Tests](https://img.shields.io/badge/Tests-12%2F12-37c99b?style=for-the-badge)
![Privacy](https://img.shields.io/badge/Privacy-Local--first-15171a?style=for-the-badge)

</div>

---

## Why Relay?

Long AI conversations contain decisions, completed work, file names, errors, and the exact next step. When a provider slows down or reaches a limit, moving to another AI usually means copying fragments and explaining everything again.

Relay turns the current conversation into a structured handoff:

- **Current objective**
- **Completed work**
- **Important decisions**
- **Files and code involved**
- **Errors and blockers**
- **Exact next step**

You review the handoff before inserting or sending it. Relay never submits a message automatically.

## Supported AI providers

| Provider | Read current chat | Receive a handoff | Account usage |
|---|:---:|:---:|:---:|
| Claude | ✅ | ✅ | ✅ When Claude exposes signed-in usage |
| ChatGPT | ✅ | ✅ | Not guessed |
| Gemini | ✅ | ✅ | Not guessed |
| Perplexity | ✅ | ✅ | Not guessed |

The **This Chat · Estimate** meter is available across providers. It estimates the size of readable messages locally; it is not an account quota or official provider token count.

## Browser extension

### Install

1. Download [Relay-Extension-0.5.6.zip](https://github.com/vikashkumar302004/Relay-ai/raw/refs/heads/main/website/Relay-Extension-0.5.6.zip).
2. Extract the ZIP.
3. Open <code>chrome://extensions</code> in Chrome or <code>edge://extensions</code> in Edge.
4. Enable **Developer mode**.
5. Choose **Load unpacked** and select the extracted folder.
6. Refresh any open Claude, ChatGPT, Gemini, or Perplexity tabs.

### Use

1. Open a conversation on a supported AI website.
2. Open the Relay panel.
3. Check the detected chat estimate.
4. Choose the AI you want to continue with.
5. Review the prepared context and insert it into the destination chat.

If a provider changes its page structure, Relay displays **Messages not detected—retry** instead of silently producing an empty handoff.

## What v0.5.6 includes

- Separate message adapters for Claude, ChatGPT, Gemini, and Perplexity
- Automatic chat and route-change detection
- Manual chat-detection retry
- Structured context capsules
- ChatGPT and Gemini layout fallbacks
- Claude five-hour and weekly usage when exact signed-in data is available
- Claude alerts at 25%, 10%, and limit reached
- Larger, readable panel typography
- Local clipboard fallback when a destination composer cannot be found

## Privacy and control

- Conversations are processed inside the browser.
- Relay does not run a conversation collection server.
- Provider passwords and session cookies are never stored by Relay.
- No provider API key is required for browser handoffs.
- A handoff is never submitted without the user.
- Account-usage numbers are shown only when exact provider data is available.

## Windows companion

The repository also contains the original Electron desktop companion:

- System-tray launcher
- Global <code>Ctrl+Shift+Space</code> shortcut
- Local Claude Code and Codex session discovery
- Resume, search, rename, pin, tags, and notes
- Focus Queue and diagnostics
- Local backup and restore
- Windows NSIS packaging

## Project structure

~~~text
Relay-ai/
├── extension/          Chrome/Edge Manifest V3 extension
├── website/            Download website and About page
├── src/                React desktop renderer
├── tests/              Extension and desktop tests
├── assets/             App icons and assets
├── main.js             Electron main process
├── preload.js          Secure renderer bridge
├── sessions.js         Local session discovery
├── vite.config.js      Renderer build configuration
└── package.json        Scripts and packaging
~~~

## Local development

Requirements: Node.js 18+ and Windows 10/11 for the desktop app.

~~~powershell
git clone https://github.com/vikashkumar302004/Relay-ai.git
cd Relay-ai
npm install
npm run dev
~~~

Run the packaged-style desktop app:

~~~powershell
npm run build:renderer
npm start
~~~

Run verification:

~~~powershell
npm run check
npm test
~~~

Current automated result: **12 tests passed**.

## Releases

| Component | Version | Download |
|---|---:|---|
| Browser extension | 0.5.6 | [ZIP](https://github.com/vikashkumar302004/Relay-ai/raw/refs/heads/main/website/Relay-Extension-0.5.6.zip) |
| Windows desktop | 1.4.0 | Website installer section |

## Roadmap

- Editable handoff preview
- Recent handoff history
- Reusable project memory
- Provider-adapter diagnostics
- Chrome Web Store submission when publisher registration is ready

## Creator

Relay is independently designed and built by [Vikash Kumar](https://github.com/vikashkumar302004).

## License and ownership

Relay is open-source software released under the [MIT License](LICENSE).

You may use, copy, modify, distribute, and build on Relay. The copyright and MIT permission notice must remain in copies or substantial portions of the software, preserving credit to **Vikash Kumar** as the original author.

See [LICENSE](LICENSE) and [NOTICE](NOTICE) for the complete terms. Third-party dependencies remain governed by their respective licenses.

---

<div align="center">

**One thread. Any AI.**

</div>
