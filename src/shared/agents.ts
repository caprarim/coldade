// The agent catalog — the single source of truth for every button in the app.
//
// Each entry knows three things: how to detect whether the CLI is already on the
// machine (`bin`), how to install it if it isn't (`install`), and how to launch it
// (`run`). Clicking a button in ColdADE opens a terminal that does all three in
// order, so a fresh PC goes from "nothing installed" to "live coding" in one click.
//
// Install commands are PowerShell — they are embedded into the generated bootstrap
// script (see `buildBootstrap` in src/main/main.ts).
//
// EVERY `run` carries that CLI's permission-bypass flag, so a button click lands
// you in a session that never stops to ask. The flag differs per vendor and is
// not guessable — each one below is the documented switch for that tool:
//
//   agy          --dangerously-skip-permissions
//   qwen         --yolo                          (alias: --approval-mode=yolo)
//   kimi         --yolo                          (hidden aliases: --yes, --auto-approve)
//   codex        --dangerously-bypass-approvals-and-sandbox
//   cursor-agent --force
//   claude       --dangerously-skip-permissions
//   grok         --always-approve
//   copilot      --allow-all-tools

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

/** The card shown at the top of a terminal the moment an agent launches:
 *  how to get this specific CLI running without paying, in the fewest steps. */
export interface AgentGuide {
  /** One line: what the free (or cheapest) route actually is. */
  headline: string;
  /** Ordered steps, first thing to do first. Keep each under ~90 chars. */
  steps: string[];
  /** Where to sign up / activate. Opened in the system browser. */
  url?: string;
  /** The gotcha this CLI is known for — shown in warning colour. */
  caveat?: string;
}

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
  /** Shown inside the terminal panel on launch. */
  guide: AgentGuide;
  /** A failure this CLI is known to hit on first login. When the terminal
   *  prints something matching `pattern`, the panel re-opens the guide and
   *  writes `hint` into the scrollback, so the fix lands next to the error
   *  instead of the user having to go looking for it. */
  recover?: { pattern: string; hint: string };
}

export const AGENTS: AgentSpec[] = [
  // ── Free: no card required ────────────────────────────────────────────────
  {
    type: 'antigravity',
    label: 'Gemini',
    tier: 'free',
    bin: 'agy',
    install: 'Invoke-RestMethod https://antigravity.google/cli/install.ps1 | Invoke-Expression',
    run: 'agy --dangerously-skip-permissions',
    color: '#4285f4',
    // Google switched the free Gemini CLI quota off on 18 Jun 2026 and moved
    // free/Pro/Ultra users to Antigravity CLI (`agy`), so that is what the
    // "Gemini" button installs. The old `gemini` binary now needs a paid key.
    note: 'Free with a Google account · weekly cap',
    guide: {
      headline: 'Free on a personal Google account — no card, no API key.',
      steps: [
        'Run /login and pick "Sign in with Google", then approve the browser page.',
        'Come back here — the session picks up as soon as the browser says done.',
        'The free tier is a weekly cap, not a daily one. /stats shows what is left.',
      ],
      url: 'https://antigravity.google',
      caveat: 'Sign in with a personal @gmail.com. A Workspace or Cloud account resolves to a billing project and asks for a paid key.',
    },
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
    guide: {
      headline: '2,000 requests a day, free, on a qwen.ai account.',
      steps: [
        'Run /login and choose the qwen.ai OAuth option.',
        'Finish the sign-in in the browser; the quota attaches to that account.',
        'The counter resets daily — nothing to top up and no billing to configure.',
      ],
      url: 'https://chat.qwen.ai',
      caveat: 'The other login option, a ModelStudio API key, is the paid path. Stay on OAuth to keep it free.',
    },
  },
  {
    type: 'kimi',
    label: 'Kimi',
    tier: 'free',
    bin: 'kimi',
    // The `kimi-cli` package on npm is an unrelated front-end scaffolder, not
    // Moonshot's agent — the official Windows path is this installer.
    install: 'Invoke-RestMethod https://code.kimi.com/install.ps1 | Invoke-Expression',
    run: 'kimi --yolo',
    color: '#22d3ee',
    // Deliberately not "free tier on Kimi K2.5": the CLI installs and starts
    // fine with no plan on the account, then the OAuth login is rejected at the
    // models endpoint. The claim step is the part people miss.
    note: 'Free plan · claim Kimi Code first · 256K context',
    guide: {
      headline: 'Free — but the Kimi Code plan has to be claimed on your account first.',
      steps: [
        'Open kimi.com/code and claim the free Kimi Code plan (sign in first if needed).',
        'Back here, run /login and approve the device code shown in the terminal.',
        'No plan attached = login is rejected, even though the CLI itself installed fine.',
      ],
      url: 'https://www.kimi.com/code',
      caveat: 'Already claimed and still rejected? Run /provider and paste a Moonshot API key from platform.moonshot.ai instead — that path skips the membership check.',
    },
    recover: {
      pattern: 'unable to verify your membership|rejected OAuth credentials|membership is active',
      hint: 'ColdADE: that error means no active Kimi Code plan is attached to this account. Claim the free plan at https://www.kimi.com/code, then run /login again — or run /provider and use a Moonshot API key.',
    },
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
    guide: {
      headline: 'Free on any ChatGPT account, including a free one.',
      steps: [
        'Run /login and choose "Sign in with ChatGPT".',
        'Approve it in the browser — a free account works, Plus/Pro just raises the limits.',
        'Hit a limit? /model to a smaller model rather than adding billing.',
      ],
      url: 'https://chatgpt.com',
      caveat: 'Do not paste an API key at the login prompt — that switches Codex to per-token billing.',
    },
  },
  {
    type: 'cursor',
    label: 'Cursor',
    tier: 'free',
    bin: 'cursor-agent',
    install: 'Invoke-RestMethod https://cursor.com/install | Invoke-Expression',
    // `--force` allows all file modifications without prompting; `-f` is its
    // short form. Spelled out so it survives a CLI surface change.
    run: 'cursor-agent --force',
    color: '#00c8c8',
    note: 'Free Hobby plan, no card · limited agent requests',
    guide: {
      headline: 'Free Hobby plan — no card, but a small monthly pool of agent requests.',
      steps: [
        'Run /login (or cursor-agent login) and finish the sign-in in the browser.',
        'Hobby includes a limited number of agent requests per month.',
        '/model → pick a cheaper model to make the pool stretch further.',
      ],
      url: 'https://cursor.com/dashboard',
      caveat: 'The pool is per month, not per day — a long session can spend most of it in one sitting.',
    },
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
    guide: {
      headline: 'No free tier — this one needs Claude Pro/Max or API credits.',
      steps: [
        'Run /login and pick your subscription (Pro or Max) rather than an API key.',
        'API credits work too, but they bill per token instead of a flat monthly fee.',
        'The Account button in the topbar swaps between two logins when one hits its limit.',
      ],
      url: 'https://claude.ai/upgrade',
      caveat: 'Want to stay free? Gemini, Qwen and Codex do the same job on this machine at no cost.',
    },
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
    guide: {
      headline: 'Needs SuperGrok, or an xAI API key with credit on it.',
      steps: [
        'Run /login for a SuperGrok account, or set XAI_API_KEY for pay-as-you-go.',
        'New xAI console accounts often carry a small monthly credit — check before topping up.',
        'Nothing here is free-forever; the free agents are the ones in the Free row.',
      ],
      url: 'https://console.x.ai',
    },
  },
  {
    type: 'copilot',
    label: 'Copilot',
    tier: 'pro',
    bin: 'copilot',
    install: 'npm install -g @github/copilot@latest',
    run: 'copilot --allow-all-tools',
    color: '#fbbf24',
    note: 'GitHub Copilot plan · Free tier exists',
    guide: {
      headline: 'GitHub Copilot Free gives a personal account a monthly allowance — no card.',
      steps: [
        'Run /login and authorise the device code on github.com.',
        'Copilot Free covers a fixed number of premium requests per month on a personal account.',
        '/model switches between the models your plan actually covers.',
      ],
      url: 'https://github.com/settings/copilot',
      caveat: 'An org-managed account only gets Copilot if the org bought seats — a personal account is the reliable free route.',
    },
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
