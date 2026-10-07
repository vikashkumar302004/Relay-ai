# Relay browser extension

Relay adds a small continuity control to supported AI websites. It reads the visible conversation only after the user selects another provider, builds a local context capsule, opens the destination, and lets the user insert the capsule for review. It never submits a message automatically.

Supported in the first release:

- Claude
- ChatGPT
- Gemini
- Perplexity

On Claude, Relay can read the signed-in account's native five-hour and weekly usage response locally. This is best-effort because Claude's private web interface can change; Relay stores no session cookie and sends no usage data to a Relay server.

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

## Acknowledgement

The Claude native-usage adapter was independently implemented after studying the MIT-licensed Claude Counter project's public approach. Relay retains its own interface, architecture, handoff workflow, and implementation.
