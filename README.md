# ColdADE

A free agentic dev environment. Click an agent, and ColdADE installs its CLI, opens a
live terminal, and drops you straight into a coding session. No setup, no config files,
no hunting for install commands.

Run several agents side by side in a resizable grid, each in its own workspace, with a
built-in file editor and browser panel — and drive the whole thing over a local HTTP API.

## Install

Download `ColdADE-Setup-<version>.exe` from
[Releases](https://github.com/caprarim/coldade/releases/latest) and run it. It installs
per-user and launches itself — no wizard, no admin prompt, no options to click through.

## Agents

Every button installs its CLI on first use and caches it forever after.

### Free — no card required

| Agent | CLI | What you get |
|---|---|---|
| **Gemini** | `agy` | Google's Antigravity CLI. Free with a Google account, weekly compute cap. |
| **Qwen** | `qwen` | 2,000 requests/day, no token limit, via a qwen.ai login. |
| **Kimi** | `kimi` | Moonshot's Kimi K2.5, 256K context. |
| **Codex** | `codex` | OpenAI's CLI, free on a ChatGPT account. |

> Google switched off the free Gemini CLI quota on 18 June 2026 and moved free, Pro and
> Ultra users to **Antigravity CLI** (`agy`). That is what the Gemini button installs —
> the old `gemini` binary now needs a paid API key.

### Pro tiers — paid plan or API key

| Agent | CLI | Needs |
|---|---|---|
| **Claude** | `claude` | Claude Pro / Max, or API credits |
| **Grok** | `grok` | SuperGrok, or xAI API credits |
| **Cursor** | `cursor-agent` | Cursor Pro |
| **Copilot** | `copilot` | GitHub Copilot |

Adding or changing an agent is a single entry in
[`src/shared/agents.ts`](src/shared/agents.ts) — the buttons, presets, control API,
panel colours and install logic all read from that one list.

## Features

- **One-click install.** A generated PowerShell bootstrap detects whether the CLI is
  present, installs it if not, refreshes `PATH` from the registry so the new binary is
  visible without restarting, then launches the agent.
- **Split terminals.** Real PTYs via `node-pty` + xterm.js. Drag to resize, double-click
  a title to rename, or go full-screen (`Esc` to exit).
- **Workspaces.** Each one is isolated, with its own Claude config directory, so
  switching accounts in one does not disturb another.
- **Auto-naming.** Tabs rename themselves from what you ask the agent to do — an instant
  heuristic label, refined by a model call in the background.
- **Account switching.** Swap between Claude accounts and restart just that workspace's
  Claude terminals. Hitting a usage limit triggers the swap automatically.
- **Quick-launch presets.** Spawn a whole team in one click; build and save your own.
- **Editor + browser panels.** Edit files and preview a site next to the terminals.
- **Control API.** Drive everything over HTTP — see [CLAUDE.md](CLAUDE.md).

## Development

```bash
npm install
npm run build     # bundle main + renderer
npm start         # build, then launch
npm run typecheck # tsc --noEmit
npm run package   # build the NSIS installer into release/
```

Requires Node 20+. `node-pty` ships prebuilt N-API binaries for win32-x64, so the
`electron-rebuild` step in `postinstall` failing is harmless.

## Notes

- Claude account profiles are read from `%APPDATA%\agent-terminals\claude-accounts`,
  shared with the older launcher so existing profiles keep working.
- The control API binds loopback only. Extra instances take the next free port
  (4576, 4577, …); the port badge in the top bar shows which one is live.

## License

MIT
