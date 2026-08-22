English | [中文](README.md)

# dsh-sound-plugin

Tired of staring at the AI while it works? Install this plugin and just go do something else — scroll videos, grab a coffee. A chime will let you know the moment the AI finishes responding, or when it stops to ask you a question.

> A plugin for the **DeepSeek Harness (DSH) Web UI**: pure client-side, the chimes are synthesized live with Web Audio — no audio assets, no extra network requests, no model calls.

## Features

- 🔔 **Whole-turn completion chime** — signals on the current session's `running` bit flipping true→false; fires on completion, error, max-tokens, and stop alike. Plays a rising "ta-da" arpeggio.
- 💬 **Question-wait chime** — when the AI pauses mid-turn to ask you something via `ask_user_question` (plan reviews included), a distinct two-tone "ding" tells you an answer is needed.
- 🤖 **Subagent-aware** — stays silent while a background subagent is still running; it only chimes once the whole task, subagents included, is really done.
- 🎛️ **Per-browser control** — mute, adjust volume, or chime only when the tab is hidden, all via `localStorage`, no code changes.
- 🔊 **Zero-asset** — all chimes are synthesized with Web Audio; no audio files, no network requests.
- 🖱️ **Autoplay-policy friendly** — warms up the `AudioContext` on the first user gesture, so no manual click is needed to unlock sound.
- 🧹 **Self-cleaning** — releases all subscriptions and listeners on unload / HMR.

## Recommended Companion

Pair it with [**dsh-retry-plugin**](https://github.com/jedzqer/dsh-retry-plugin) — a plugin for DeepSeek Harness (DSH) that automatically sends "continue" to retry the request when the AI access fails (network hiccups, rate limits, server 5xx…), so the conversation is never interrupted. Combined with the sound alerts, even a transient failure that auto-retry catches still ends with a chime you'll hear when the task is really done.

```sh
# Install it into the web profile too
dsh plugin --profile web add dsh-retry-plugin
```

## Installation

### Prerequisites

- [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) installed (the `dsh` command available)
- [pnpm](https://pnpm.io) (`dsh plugin` manages plugins through it)

### Steps

```sh
# 1. Add the plugin to the web profile
dsh plugin --profile web add dsh-sound-plugin

# 2. Restart the web UI so the plugin set takes effect (client module metadata is cached by name)
dsh web
```

For local development, you can instead add a local copy from the plugin source directory:

```sh
dsh plugin --profile web add ./dsh-sound-plugin
```

To uninstall:

```sh
dsh plugin --profile web remove dsh-sound-plugin
```

## Usage / Configuration

The plugin is enabled by default and needs no configuration. Client modules carry no row config, so two levels of control are provided:

- **By code**: edit the `DEFAULTS` constants at the top of `client.js` (`enabled` / `volume` / `hiddenOnly`).
- **Per browser**: run in the browser's DevTools Console:

```js
localStorage.setItem("dsh-sound.enabled",    "false");  // mute
localStorage.setItem("dsh-sound.volume",     "0.25");   // volume 0..1
localStorage.setItem("dsh-sound.hiddenOnly", "true");   // chime only when the tab is hidden
```

### Behavior notes

- Listens only to the **current session** (the one selected in the sidebar); switching sessions follows automatically. Clicking into a finished history conversation while another session is still running does **not** chime — only a session that stays selected chimes when it ends.
- **Two chimes**: a two-tone "ding" (`question`) when the AI asks you something, and a rising "ta-da" arpeggio (`done`) when the whole turn really finishes.
- Error / max-tokens / stop endings chime as well.
- Subagent (including background subagent) waits do not chime; opening a history conversation does not chime; switching to a session that is already waiting on a question does not chime either.
- After editing `client.js`, **no restart** of `dsh web` is needed — just refresh the page (Ctrl+F5 recommended); a restart is only required when adding or removing plugins.

## How it works

- The plugin consists of a Node half (`index.js`, an empty `apply` that only places the plugin in the Host's Loader) and a browser half (`client.js`, discovered through the `dsh.client` declaration).
- The browser half subscribes to the session-list snapshot and watches two signals on the current session's row:
  - **Completion**: the **`running` bit true→false edge** — the same signal the client runtime's own sidebar "done" reminder uses; every real end fires it exactly once, playing the "done" chime.
  - **Question**: `pendingInteraction` becoming `"question"` / `"plan-review"` (from `question/requested` frames) — while a question is pending the agent loop pauses the tool call and `running` stays true, so only this rising edge tells you an answer is needed, playing the "question" chime. Plugin approvals (`"approval"`) are not chimed.
- **Subagent gate**: when `running` flips to false, if the session still has any running subagent descendants (`origin: 'subagent'` + `parentId` chain), the plugin stays quiet until the whole task is truly complete.

## License

[MIT](LICENSE)
