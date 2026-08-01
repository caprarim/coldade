# ColdADE — Control API

This app exposes a **localhost HTTP control API** so an agent (e.g. you, running inside
one of the terminals) can open new agent terminals and type prompts into them — no
screen-coordinate mouse clicking required.

Base URL: `http://127.0.0.1:4575` (override with the `AGENT_LAUNCHER_PORT` env var).
It is bound to loopback only and is up whenever the app is running.

Multiple instances can run side by side: the first binds 4575 and each extra one takes
the next free port (4576, 4577, ...). Every terminal's environment carries
`AGENT_LAUNCHER_PORT` set to ITS instance's actual port — so from inside a terminal
always use `http://127.0.0.1:$env:AGENT_LAUNCHER_PORT` (or `$AGENT_LAUNCHER_PORT` in
bash) rather than hardcoding 4575. The port is no longer shown as a topbar badge;
hover the workspace name to see it, or click the name to copy the base URL.

## Agent types

| Tier | Types |
|---|---|
| Free | `antigravity` (Gemini), `qwen`, `kimi`, `codex`, `cursor` |
| Pro  | `claude`, `grok`, `copilot` |

Every agent launches with its permission-bypass flag already applied
(`--dangerously-skip-permissions`, `--yolo`, `--force`, … — the exact switch per
CLI is listed at the top of `src/shared/agents.ts`), so an API-driven agent never
stalls on an approval prompt.

`POST /agents` defaults to `antigravity` when `type` is omitted, so an unspecified call
never opens a terminal that demands a paid plan. The catalog lives in
`src/shared/agents.ts` — add an entry there and it appears everywhere automatically.

Each catalog entry also carries a `guide` (headline, steps, sign-up URL, caveat) that
the terminal panel shows on launch — the "how do I run this one for free" card, closed
with `×` and reopened with the `?` in the panel header. An entry may add a `recover`
`{ pattern, hint }`: when the terminal prints something matching `pattern`, the panel
writes `hint` into the scrollback and reopens the guide. Kimi uses this, because its
OAuth login is rejected with a membership error when no Kimi Code plan has been claimed
on the account — the CLI installs and starts fine, so the error is the first sign.

Opening a terminal also **installs that CLI if it is missing** (see
"Install bootstrap" below), so the first call for a given type can take a minute.

## Endpoints

| Method & path | What it does |
|---|---|
| `GET /agents` | List all terminals: `id`, `name`, `type`, `status`, `cwd`. |
| `POST /agents` | Add a terminal. Body: `{ "type": "qwen" }`. Returns the new agent; only resolves once its terminal PTY is live. Capped at **5 agents**. |
| `POST /orchestrate` | **Fast path.** Spawn a whole team + assign tasks in ONE call. Body: `{ "goal": "...", "tasks": ["t1","t2",...], "type": "qwen" }`. Spawns all agents in parallel, detects readiness automatically (no fixed sleep), then injects each agent's task plus shared cross-agent context. Capped at 5. |
| `POST /agents/:id/input` | Type into a terminal. Body: `{ "text": "...", "submit": true }`. `submit` (default true) presses Enter. |
| `GET /agents/:id/output` | Read recent output (ANSI-stripped). Query: `?tail=4000` (last N chars), `?raw=1` (keep ANSI). |
| `DELETE /agents/:id` | Close a terminal. |

## Example (PowerShell)

```powershell
# 1) Open a new Qwen terminal and capture its id
$a = Invoke-RestMethod -Method Post http://127.0.0.1:4575/agents -ContentType application/json -Body '{"type":"qwen"}'
$id = $a.agent.id

# 2) Give the agent a few seconds to finish booting, then send a prompt
Start-Sleep -Seconds 6
Invoke-RestMethod -Method Post "http://127.0.0.1:4575/agents/$id/input" -ContentType application/json -Body '{"text":"write a hello world in python","submit":true}'

# 3) Read what it printed back
Invoke-RestMethod "http://127.0.0.1:4575/agents/$id/output?tail=4000"
```

## Example (curl / bash)

```bash
id=$(curl -s -X POST localhost:4575/agents -d '{"type":"qwen"}' | python -c 'import sys,json;print(json.load(sys.stdin)["agent"]["id"])')
sleep 6
curl -s -X POST localhost:4575/agents/$id/input -d '{"text":"write a hello world in python","submit":true}'
curl -s "localhost:4575/agents/$id/output?tail=4000"
```

## Orchestration (how to fulfill user requests)

**Preferred: use `POST /orchestrate`.** It replaces the old multi-call + 6-second-sleep
dance with a single request that spawns the whole team in parallel, waits for each agent
to actually be ready (marker/settle detection instead of a blind sleep), and injects
every task at once — plus shared "you are Agent N of M, the others are doing X" context
so the agents coordinate.

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:4575/orchestrate -ContentType application/json -Body (@{
  goal  = "Build the authentication system"
  type  = "qwen"
  tasks = @(
    "Build the login + signup REST endpoints in src/auth/routes.ts",
    "Build the JWT/session middleware in src/auth/middleware.ts",
    "Build the login/signup React UI in src/components/Auth.tsx",
    "Write integration tests for the auth flow in tests/auth.test.ts"
  )
} | ConvertTo-Json)
```

One `tasks` entry = one agent. Total agents are capped at **5** (existing + new). Extra
tasks beyond the cap come back in `dropped`.

### Legacy manual protocol (only if you need per-agent control)

1. **Spawn:** loop N times calling `POST /agents` with the requested type.
2. **Collect IDs:** store the `id` returned for each new agent.
3. **Wait for boot:** poll `GET /agents/:id/output` until the CLI prompt appears.
4. **Send task:** for each id, `POST /agents/:id/input` with `{"submit": true}`.
5. **Confirm:** tell the user the agents are launched and tasked.

## Install bootstrap

`pty:create` in `src/main/main.ts` generates a per-agent PowerShell script into
`%APPDATA%\coldade\bootstrap\<bin>.ps1` and runs it in the terminal. The script:

1. probes for the CLI with `Get-Command`;
2. runs the vendor install command if it is missing;
3. **re-reads `PATH` from the registry** — vendor installers append to the *user* PATH,
   which the already-running `cmd.exe` cannot see, so without this the freshly installed
   CLI would look missing until an app restart;
4. launches the agent, or prints the manual install command if it still is not found.

The file is written with a UTF-8 **BOM** on purpose: Windows PowerShell 5.1 decodes a
BOM-less script as ANSI, which turns any non-ASCII character into mojibake.

Claude terminals get a pinned `--session-id` injected *before* the bootstrap wraps the
command, so an account-switch restart resumes that terminal's own conversation.

## Preflight & recovery (API "down" / connection refused)

1. **Is anything on 4575?** `Get-NetTCPConnection -State Listen -LocalPort 4575`.
   If nothing is listed, the API is not bound.
2. **Is the app running?** `Get-Process ColdADE`. If yes but step 1 is empty, the running
   instance failed to bind.
3. **Recover:** relaunch the exe — a fresh instance rebinds and logs
   `[control] ColdADE control API on http://127.0.0.1:4575`.

Hardened in source: `controlServer.ts` retries on `EADDRINUSE` (10× / 1s) instead of
failing silently, and `main.ts` claims a numbered instance dir rather than fighting over
one. After editing either, run `npm run package` so the shipped binary carries the fix.

## Packaging recovery (app won't launch)

- **"A JavaScript error occurred in the main process"** — the `app.asar` is broken.
  Check that it contains `package.json` and that `node_modules/node-pty` is unpacked.
- **"...package.json: Unexpected token...not valid JSON"** — the file has a UTF-8 BOM.
  Rewrite it BOM-free (the *bootstrap* scripts want a BOM; `package.json` must not have one).
- `node-pty` ships N-API prebuilds for win32-x64, so a failing `electron-rebuild` in
  `postinstall` is harmless and does not need fixing.

## Notes

- After `POST /agents` the terminal auto-runs the bootstrap, which may install the CLI
  first. Poll the output rather than assuming a fixed startup delay.
- To send a prompt without submitting, use `"submit": false`, then later send
  `{ "text": "", "submit": true }` to press Enter.
