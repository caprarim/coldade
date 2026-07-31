// The agent catalog — the single source of truth for every button in the app.
//
// Each entry knows three things: how to detect whether the CLI is already on the
// machine (`bin`), how to install it if it isn't (`install`), and how to launch it
// (`run`). Clicking a button in ColdADE opens a terminal that does all three in
// order, so a fresh PC goes from "nothing installed" to "live coding" in one click.
//
// Install commands are PowerShell — they are embedded into the generated bootstrap
// script (see `buildBootstrap` in src/main/main.ts).

export type AgentType =
  | 'antigravity'
  | 'qwen'
  | 'kimi'
  | 'codex'
  | 'claude'
  | 'grok'
  | 'cursor'
  | 'copilot';

export type AgentTier = 'free' | 'pro';

export interface AgentSpec {
  type: AgentType;
  /** Button text, e.g. "Gemini". */
  label: string;
  tier: AgentTier;
  /** Executable probed with Get-Command to decide whether to install. */
  bin: string;
  /** PowerShell that installs the CLI. */
  install: string;
  /** Command that starts the agent once it is installed. */
  run: string;
  /** Accent colour for the terminal panel + button. */
  color: string;
  /** Shown under the button — what you actually get for free. */
  note: string;
}

export const AGENTS: AgentSpec[] = [
  // ── Free: no card required ────────────────────────────────────────────────
  {
    type: 'antigravity',
    label: 'Gemini',
    tier: 'free',
    bin: 'agy',
    install: 'Invoke-RestMethod https://antigravity.google/cli/install.ps1 | Invoke-Expression',
    run: 'agy',
    color: '#4285f4',
    // Google switched the free Gemini CLI quota off on 18 Jun 2026 and moved
    // free/Pro/Ultra users to Antigravity CLI (`agy`), so that is what the
    // "Gemini" button installs. The old `gemini` binary now needs a paid key.
    note: 'Free with a Google account · weekly cap',
  },
  {
    type: 'qwen',
    label: 'Qwen',
    tier: 'free',
    bin: 'qwen',
    install: 'npm install -g @qwen-code/qwen-code@latest',
    run: 'qwen --yolo',
    color: '#a855f7',
    note: '2,000 requests/day free · qwen.ai login',
  },
  {
    type: 'kimi',
    label: 'Kimi',
    tier: 'free',
    bin: 'kimi',
    // The `kimi-cli` package on npm is an unrelated front-end scaffolder, not
    // Moonshot's agent — the official Windows path is this installer.
    install: 'Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression',
    run: 'kimi',
    color: '#22d3ee',
    note: 'Free tier on Kimi K2.5 · 256K context',
  },
  {
    type: 'codex',
    label: 'Codex',
    tier: 'free',
    bin: 'codex',
    install: 'npm install -g @openai/codex@latest',
    run: 'codex --dangerously-bypass-approvals-and-sandbox',
    color: '#22c55e',
    note: 'Free on a ChatGPT account',
  },

  // ── Pro tiers: these need a paid plan or an API key ───────────────────────
  {
    type: 'claude',
    label: 'Claude',
    tier: 'pro',
    bin: 'claude',
    install: 'npm install -g @anthropic-ai/claude-code@latest',
    run: 'claude --dangerously-skip-permissions',
    color: '#f97316',
    note: 'Claude Pro / Max or API credits',
  },
  {
    type: 'grok',
    label: 'Grok',
    tier: 'pro',
    bin: 'grok',
    install: 'Invoke-RestMethod https://x.ai/cli/install.ps1 | Invoke-Expression',
    run: 'grok',
    color: '#e5e5e5',
    note: 'SuperGrok or xAI API credits',
  },
  {
    type: 'cursor',
    label: 'Cursor',
    tier: 'pro',
    bin: 'cursor-agent',
    install: 'Invoke-RestMethod https://cursor.com/install | Invoke-Expression',
    run: 'cursor-agent -f',
    color: '#00c8c8',
    note: 'Cursor Pro plan',
  },
  {
    type: 'copilot',
    label: 'Copilot',
    tier: 'pro',
    bin: 'copilot',
    install: 'npm install -g @github/copilot@latest',
    run: 'copilot --allow-all-tools',
    color: '#fbbf24',
    note: 'GitHub Copilot plan',
  },
];

const BY_TYPE = new Map<AgentType, AgentSpec>(AGENTS.map((a) => [a.type, a]));

export function getAgent(type: AgentType): AgentSpec | undefined {
  return BY_TYPE.get(type);
}

export const AGENT_TYPES: AgentType[] = AGENTS.map((a) => a.type);

export const FREE_AGENTS: AgentSpec[] = AGENTS.filter((a) => a.tier === 'free');
export const PRO_AGENTS: AgentSpec[] = AGENTS.filter((a) => a.tier === 'pro');

export function isAgentType(value: string): value is AgentType {
  return BY_TYPE.has(value as AgentType);
}
