# Relay browser extension

Relay adds a small continuity control to supported AI websites. It reads the visible conversation only after the user selects another provider, builds a local context capsule, opens the destination, and lets the user insert the capsule for review. It never submits a message automatically.

Supported in the first release:

- Claude
- ChatGPT
- Gemini
- Perplexity

## Load locally in Chrome or Edge

1. Open `chrome://extensions` (Chrome) or `edge://extensions` (Edge).
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `extension` directory.
5. Open any supported AI website and click the Relay button in the lower-right corner.

## Privacy model

- No provider passwords or cookies are collected.
- Context capsules stay in browser extension storage.
- No AI conversation is sent to a Relay server.
- The destination message is never submitted automatically.

