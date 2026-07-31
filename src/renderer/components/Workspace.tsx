import React, { useState, useCallback, useEffect, useRef } from 'react';
import TerminalPanel from './TerminalPanel';
import BrowserPanel from './BrowserPanel';
import EditorPanel from './EditorPanel';
import { AgentInstance, AgentType, WorkspaceInfo } from '../../shared/types';
import { AGENTS, AgentSpec, FREE_AGENTS, PRO_AGENTS, getAgent } from '../../shared/agents';
import { classifyLine, dedupeTitle } from '../../shared/naming';

const counters: Record<string, number> = {};

interface PresetItem { type: AgentType; count: number; }
interface Preset { id: string; label: string; items: PresetItem[]; builtin?: boolean; }

const PRESETS_KEY = 'coldade-presets-v1';

// Built-ins stay on the free tier so a fresh install can launch a whole team
// without anyone needing a subscription.
const BUILTIN_PRESETS: Preset[] = [
  { id: 'b-qwen-3', label: '3 Qwen', items: [{ type: 'qwen', count: 3 }], builtin: true },
  { id: 'b-gem-3', label: '3 Gemini', items: [{ type: 'antigravity', count: 3 }], builtin: true },
  { id: 'b-codex-3', label: '3 Codex', items: [{ type: 'codex', count: 3 }], builtin: true },
  { id: 'b-free-4', label: 'One of each (free)', items: FREE_AGENTS.map((a) => ({ type: a.type, count: 1 })), builtin: true },
  { id: 'b-mix-4', label: '2 Qwen + 2 Gemini', items: [{ type: 'qwen', count: 2 }, { type: 'antigravity', count: 2 }], builtin: true },
];

function labelOf(type: AgentType): string {
  return getAgent(type)?.label ?? type;
}

function autoLabel(items: PresetItem[]): string {
  return items.filter((r) => r.count > 0).map((r) => `${r.count} ${labelOf(r.type)}`).join(' + ');
}

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) {
      const custom = JSON.parse(raw) as Preset[];
      if (Array.isArray(custom)) {
        const valid = custom.filter(
          (p) => p && typeof p.id === 'string' && Array.isArray(p.items) && p.items.length > 0
            // Drop presets referencing agents that no longer exist in the catalog.
            && p.items.every((i) => getAgent(i.type)),
        );
        return [...BUILTIN_PRESETS, ...valid];
      }
    }
  } catch (_e) {}
  return [...BUILTIN_PRESETS];
}

function gridCols(count: number): number {
  if (count <= 1) return 1;
  if (count <= 2) return 2;
  return 3;
}

const MIN_PANEL_W = 300;
const MAX_PANEL_RATIO = 0.75;
const DEFAULT_PROJECT_PATH = 'C:\\dev';
const GRID_GAP = 6;
const DEFAULT_TERMINAL_W = 400;
const DEFAULT_TERMINAL_H = 300;

type RightTab = 'browser' | 'editor';

export interface WorkspaceApi {
  addAgent: (type: AgentType) => AgentInstance;
  removeAgent: (id: string) => void;
}

interface Props {
  workspace: WorkspaceInfo;
  active: boolean;
  onAgentsChange: (wsId: string, agents: AgentInstance[]) => void;
  registerApi: (wsId: string, api: WorkspaceApi | null) => void;
}

/** One agent button. `size` drives the two layouts: tiles in the empty state,
 *  compact rows inside the topbar popover. */
function AgentButton({
  spec, onClick, size,
}: { spec: AgentSpec; onClick: () => void; size: 'tile' | 'row' }): JSX.Element {
  const style = { '--agent': spec.color } as React.CSSProperties;
  if (size === 'row') {
    return (
      <button className="agent-row" style={style} onClick={onClick} title={spec.note}>
        <span className="agent-dot" />
        <span className="agent-row-label">{spec.label}</span>
        <span className="agent-row-note">{spec.note}</span>
      </button>
    );
  }
  return (
    <button className="agent-tile" style={style} onClick={onClick}>
      <span className="agent-tile-top">
        <span className="agent-dot" />
        <span className="agent-tile-label">{spec.label}</span>
      </span>
      <span className="agent-tile-note">{spec.note}</span>
    </button>
  );
}

export default function Workspace({ workspace, active, onAgentsChange, registerApi }: Props): JSX.Element {
  const [agents, setAgents] = useState<AgentInstance[]>([]);
  const [projectPath, setProjectPath] = useState(DEFAULT_PROJECT_PATH);
  const [cdInput, setCdInput] = useState('');
  const [rightTab, setRightTab] = useState<RightTab | null>(null);
  const [panelWidth, setPanelWidth] = useState(520);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [apiPort, setApiPort] = useState(4575);
  const [addOpen, setAddOpen] = useState(false);
  const [panelSizes, setPanelSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [gridDims, setGridDims] = useState({ width: 0, height: 0 });
  const gridRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Each launcher instance binds its own control port (4575, 4576, ...).
  useEffect(() => {
    window.electronAPI.getControlPort().then(setApiPort).catch(() => {});
  }, []);

  const showToast = useCallback((text: string, kind: 'ok' | 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ text, kind });
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }, []);

  // Toasts for account switches, including automatic ones triggered by a
  // usage limit hit in any Claude terminal.
  useEffect(() => {
    return window.electronAPI.onAccountSwitched((res) => {
      if (res.workspaceId !== workspace.id) return;
      if (res.ok) {
        const prefix = res.reason === 'limit' ? 'Usage limit reached: switched' : 'Switched';
        showToast(`${prefix} to ${res.email}. Claude terminals in this workspace are restarting.`, 'ok');
      } else {
        showToast(res.error || 'Account switch failed.', 'error');
      }
    });
  }, [showToast, workspace.id]);

  const handleSwitchAccount = async () => {
    if (switching) return;
    setSwitching(true);
    try {
      await window.electronAPI.switchAccount(workspace.id, workspace.configDir);
    } finally {
      setSwitching(false);
    }
  };

  // Per-agent naming state: the default fallback name (e.g. "qwen-agent-3")
  // and whether the user has taken over the name manually (which pauses
  // auto-naming until the next /clear).
  const nameStateRef = useRef<Map<string, { base: string; manual: boolean }>>(
    new Map(),
  );
  // Bumped on every rename (auto or manual) so a slower, in-flight model
  // response can tell it's been superseded and skip applying its title.
  const nameGenRef = useRef<Map<string, number>>(new Map());

  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartW = useRef(0);

  const cwd = projectPath.trim() || DEFAULT_PROJECT_PATH;

  const addAgent = useCallback((type: AgentType): AgentInstance => {
    const spec = getAgent(type);
    counters[type] = (counters[type] || 0) + 1;
    const id   = `${type}-${Date.now()}-${counters[type]}`;
    const name = `${type}-agent-${counters[type]}`;
    const agent: AgentInstance = {
      id,
      type,
      name,
      command: spec?.run ?? type,
      status: 'starting',
      cwd,
      workspaceId: workspace.id,
    };
    nameStateRef.current.set(id, { base: name, manual: false });
    setAgents((prev) => [...prev, agent]);
    return agent;
  }, [cwd, workspace.id]);

  const removeAgent = useCallback((id: string) => {
    nameStateRef.current.delete(id);
    setFullscreenId((cur) => (cur === id ? null : cur));
    setAgents((prev) => prev.filter((a) => a.id !== id));
    setPanelSizes((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handlePanelResize = useCallback((id: string, width: number, height: number) => {
    setPanelSizes((prev) => ({ ...prev, [id]: { width, height } }));
  }, []);

  const hasAgents = agents.length > 0;
  useEffect(() => {
    if (!hasAgents) return;
    const el = gridRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setGridDims({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasAgents]);

  const toggleFullscreen = useCallback((id: string) => {
    setFullscreenId((cur) => (cur === id ? null : id));
  }, []);

  useEffect(() => {
    if (!fullscreenId || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreenId, active]);

  // Close the add-agent popover on outside click / Escape.
  useEffect(() => {
    if (!addOpen) return;
    const onDown = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAddOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [addOpen]);

  // Label one tab, keeping it distinguishable from its siblings. Two agents
  // working the same area of the codebase legitimately derive the same label,
  // and without this the grid renders several identical tabs.
  const applyName = useCallback((id: string, name: string) => {
    setAgents((prev) => prev.map((a) => {
      if (a.id !== id) return a;
      const siblings = prev.filter((o) => o.id !== id).map((o) => o.name);
      return { ...a, name: dedupeTitle(name, siblings) };
    }));
  }, []);

  // Reset a tab to its "qwen-agent-3" default and re-arm auto-naming.
  const resetName = useCallback((id: string) => {
    const state = nameStateRef.current.get(id);
    if (!state) return;
    state.manual = false;
    nameGenRef.current.set(id, (nameGenRef.current.get(id) || 0) + 1);
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, name: state.base } : a)));
  }, []);

  // Auto-naming: a full line the user typed into a terminal. "/clear" resets the
  // name, a real instruction re-labels the tab with the thing being worked on
  // ("Fix Voice Dictation"), and confirmations ("yes go ahead") / other
  // slash-commands are ignored. Skips agents the user renamed by hand, until /clear.
  //
  // The offline heuristic label lands instantly, then a model call refines it in
  // the background and overwrites the name if it returns before the next prompt.
  const handleAgentPrompt = useCallback((id: string, line: string) => {
    const state = nameStateRef.current.get(id);
    if (!state) return;
    const { kind, title } = classifyLine(line);

    if (kind === 'clear') return resetName(id);
    if (kind !== 'task' || state.manual) return;

    const gen = (nameGenRef.current.get(id) || 0) + 1;
    nameGenRef.current.set(id, gen);

    if (title) applyName(id, title);

    window.electronAPI.nameAgentPrompt(line)
      .then((aiTitle) => {
        if (!aiTitle) return;
        if (nameGenRef.current.get(id) !== gen) return; // a newer prompt superseded this one
        if (nameStateRef.current.get(id)?.manual) return;
        applyName(id, aiTitle);
      })
      .catch((err) => console.warn('[naming] could not reach the namer:', err));
  }, [applyName, resetName]);

  // Labels for agents that never touch the keyboard. Anything driven over the
  // control API (POST /agents/:id/input, /orchestrate) is written straight into
  // the PTY, so TerminalPanel's keystroke watcher never sees a prompt for it and
  // the tab used to sit on "qwen-agent-3" forever. Main computes the label and
  // pushes it here. Broadcast to every workspace — the nameStateRef lookup is
  // what scopes it to the one that actually owns the agent.
  useEffect(() => {
    return window.electronAPI.onAgentRename((id, name) => {
      const state = nameStateRef.current.get(id);
      if (!state) return;
      if (!name) return resetName(id);
      if (state.manual) return;
      nameGenRef.current.set(id, (nameGenRef.current.get(id) || 0) + 1);
      applyName(id, name);
    });
  }, [applyName, resetName]);

  // Manual rename from the panel header — takes over from the auto-namer.
  const handleAgentRename = useCallback((id: string, rawName: string) => {
    const state = nameStateRef.current.get(id);
    const name = rawName.trim().slice(0, 40);
    if (!name) return;
    if (state) state.manual = true;
    nameGenRef.current.set(id, (nameGenRef.current.get(id) || 0) + 1);
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));
  }, []);

  const addAgentRef = useRef(addAgent);
  const removeAgentRef = useRef(removeAgent);
  addAgentRef.current = addAgent;
  removeAgentRef.current = removeAgent;

  const [presets, setPresets] = useState<Preset[]>(() => loadPresets());
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderName, setBuilderName] = useState('');
  const [builderRows, setBuilderRows] = useState<PresetItem[]>([{ type: 'qwen', count: 3 }]);

  useEffect(() => {
    const custom = presets.filter((p) => !p.builtin);
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(custom));
    } catch (_e) {}
  }, [presets]);

  // Spawn every agent a preset asks for. Terminals are staggered ~350ms apart
  // so launching six at once ramps the PTYs up gently instead of spiking the PC.
  const launchPreset = useCallback((items: PresetItem[]) => {
    const queue: AgentType[] = [];
    for (const it of items) {
      for (let i = 0; i < Math.max(0, it.count); i++) queue.push(it.type);
    }
    queue.forEach((type, idx) => {
      setTimeout(() => addAgentRef.current(type), idx * 350);
    });
  }, []);

  const saveCustomPreset = useCallback(() => {
    const rows = builderRows.filter((r) => r.count > 0);
    if (rows.length === 0) return;
    const label = (builderName.trim() || autoLabel(rows)).slice(0, 40);
    const preset: Preset = { id: `c-${Date.now()}`, label, items: rows };
    setPresets((prev) => [...prev, preset]);
    setShowBuilder(false);
    setBuilderName('');
    setBuilderRows([{ type: 'qwen', count: 3 }]);
  }, [builderRows, builderName]);

  const deletePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updateBuilderRow = useCallback((idx: number, patch: Partial<PresetItem>) => {
    setBuilderRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  const addBuilderRow = useCallback(() => {
    setBuilderRows((prev) => [...prev, { type: 'codex', count: 3 }]);
  }, []);

  const removeBuilderRow = useCallback((idx: number) => {
    setBuilderRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  useEffect(() => {
    onAgentsChange(workspace.id, agents);
  }, [agents, onAgentsChange, workspace.id]);

  useEffect(() => {
    registerApi(workspace.id, {
      addAgent: (type) => addAgentRef.current(type),
      removeAgent: (id) => removeAgentRef.current(id),
    });
    return () => registerApi(workspace.id, null);
  }, [registerApi, workspace.id]);

  const handlePickDir = async () => {
    const dir = await window.electronAPI.pickDirectory();
    if (dir) setProjectPath(dir);
  };

  const applyCd = () => {
    const dir = cdInput.trim();
    if (dir) { setProjectPath(dir); setCdInput(''); }
  };

  const toggleTab = (tab: RightTab) => {
    setRightTab((prev) => (prev === tab ? null : tab));
  };

  const clampPanelWidth = useCallback((w: number) => {
    const containerW = containerRef.current?.offsetWidth ?? window.innerWidth;
    const maxW = containerW * MAX_PANEL_RATIO;
    return Math.min(maxW, Math.max(MIN_PANEL_W, w));
  }, []);

  const applyPanelWidth = useCallback((w: number) => {
    setPanelWidth(clampPanelWidth(w));
  }, [clampPanelWidth]);

  const onDragStart = (e: React.MouseEvent) => {
    dragging.current = true;
    setIsDraggingPanel(true);
    dragStartX.current = e.clientX;
    dragStartW.current = panelWidth;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const containerW = containerRef.current.offsetWidth;
      const maxW = containerW * MAX_PANEL_RATIO;
      const delta = dragStartX.current - e.clientX;
      setPanelWidth(Math.min(maxW, Math.max(MIN_PANEL_W, dragStartW.current + delta)));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setIsDraggingPanel(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const spawn = useCallback((type: AgentType) => {
    setAddOpen(false);
    addAgentRef.current(type);
  }, []);

  const cols = gridCols(agents.length);
  const rows = Math.max(1, Math.ceil(agents.length / cols));
  const defaultTerminalW = gridDims.width > 0
    ? Math.max(280, (gridDims.width - GRID_GAP * (cols - 1)) / cols)
    : DEFAULT_TERMINAL_W;
  const defaultTerminalH = gridDims.height > 0
    ? Math.max(160, (gridDims.height - GRID_GAP * (rows - 1)) / rows)
    : DEFAULT_TERMINAL_H;

  const mainContent = agents.length === 0 ? (
    <div className="empty-state">
      <div className="empty-card">
        <div className="empty-head">
          <h2 className="empty-title">{workspace.name}</h2>
          <p className="empty-sub">
            Pick an agent. ColdADE installs its CLI the first time you use it, then drops
            you straight into a live coding session.
          </p>
        </div>

        <div className="tier">
          <div className="tier-head">
            <span className="tier-name">Free</span>
            <span className="badge badge-free">No card required</span>
          </div>
          <div className="tier-grid">
            {FREE_AGENTS.map((spec) => (
              <AgentButton key={spec.type} spec={spec} size="tile" onClick={() => spawn(spec.type)} />
            ))}
          </div>
        </div>

        <div className="tier">
          <div className="tier-head">
            <span className="tier-name">Paid</span>
            <span className="badge badge-pro">Pro tiers</span>
          </div>
          <div className="tier-grid">
            {PRO_AGENTS.map((spec) => (
              <AgentButton key={spec.type} spec={spec} size="tile" onClick={() => spawn(spec.type)} />
            ))}
          </div>
        </div>

        <div className="separator" />

        <div className="presets-section">
          <div className="presets-head">
            <span className="presets-title">Quick launch</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowBuilder((v) => !v)}>
              {showBuilder ? 'Cancel' : 'New preset'}
            </button>
          </div>

          <div className="preset-grid">
            {presets.map((p) => (
              <div key={p.id} className="preset-chip">
                <button
                  className="preset-launch"
                  title={`Launch ${autoLabel(p.items)}`}
                  onClick={() => launchPreset(p.items)}
                >
                  {p.label}
                </button>
                {!p.builtin && (
                  <button className="preset-delete" title="Delete preset" onClick={() => deletePreset(p.id)}>
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>

          {showBuilder && (
            <div className="preset-builder">
              <input
                className="input"
                type="text"
                placeholder="Preset name (optional)"
                maxLength={40}
                value={builderName}
                onChange={(e) => setBuilderName(e.target.value)}
              />
              {builderRows.map((row, idx) => (
                <div key={idx} className="builder-row">
                  <input
                    className="input builder-count"
                    type="number"
                    min={1}
                    max={12}
                    value={row.count}
                    onChange={(e) => updateBuilderRow(idx, { count: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
                  />
                  <select
                    className="input builder-type"
                    value={row.type}
                    onChange={(e) => updateBuilderRow(idx, { type: e.target.value as AgentType })}
                  >
                    {AGENTS.map((a) => (
                      <option key={a.type} value={a.type}>
                        {a.label}{a.tier === 'pro' ? ' (Pro)' : ''}
                      </option>
                    ))}
                  </select>
                  {builderRows.length > 1 && (
                    <button className="btn btn-ghost btn-icon" title="Remove row" onClick={() => removeBuilderRow(idx)}>
                      &times;
                    </button>
                  )}
                </div>
              ))}
              <div className="builder-actions">
                <button className="btn btn-outline btn-sm" onClick={addBuilderRow}>Add type</button>
                <button className="btn btn-primary btn-sm" onClick={saveCustomPreset}>Save preset</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  ) : (
    <div
      className={`terminal-grid${fullscreenId ? ' terminal-grid--has-fullscreen' : ''}`}
      ref={gridRef}
    >
      {agents.map((agent) => {
        const size = panelSizes[agent.id] ?? { width: defaultTerminalW, height: defaultTerminalH };
        return (
          <TerminalPanel
            key={agent.id}
            agent={agent}
            configDir={workspace.configDir}
            onClose={() => removeAgent(agent.id)}
            onPrompt={handleAgentPrompt}
            onRename={handleAgentRename}
            isFullscreen={fullscreenId === agent.id}
            onToggleFullscreen={() => toggleFullscreen(agent.id)}
            width={size.width}
            height={size.height}
            onResize={(w, h) => handlePanelResize(agent.id, w, h)}
          />
        );
      })}
    </div>
  );

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-left">
          <span className="app-title">{workspace.name}</span>
          <span
            className="badge badge-api"
            title="Control API is live — click to copy the URL"
            onClick={(e) => {
              navigator.clipboard.writeText(`http://127.0.0.1:${apiPort}`);
              const el = e.currentTarget;
              const old = el.textContent;
              el.textContent = 'Copied';
              setTimeout(() => { el.textContent = old; }, 1500);
            }}
          >
            :{apiPort}
          </span>
        </div>

        <div className="topbar-center">
          <div className="field">
            <span className="field-icon">/</span>
            <input
              className="input field-input"
              type="text"
              placeholder={DEFAULT_PROJECT_PATH}
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
            />
            <button className="btn btn-ghost btn-sm" onClick={handlePickDir}>Browse</button>
          </div>
          <div className="field">
            <input
              className="input field-input"
              type="text"
              placeholder="cd elsewhere…"
              value={cdInput}
              onChange={(e) => setCdInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyCd(); }}
            />
            <button className="btn btn-ghost btn-sm" onClick={applyCd}>Go</button>
          </div>
        </div>

        <div className="topbar-right">
          <div className="add-wrap" ref={addRef}>
            <button
              className={`btn btn-primary btn-sm${addOpen ? ' is-open' : ''}`}
              onClick={() => setAddOpen((v) => !v)}
            >
              Add agent
            </button>
            {addOpen && (
              <div className="popover">
                <div className="popover-head">
                  <span className="popover-title">Free</span>
                  <span className="badge badge-free">No card</span>
                </div>
                {FREE_AGENTS.map((spec) => (
                  <AgentButton key={spec.type} spec={spec} size="row" onClick={() => spawn(spec.type)} />
                ))}
                <div className="separator" />
                <div className="popover-head">
                  <span className="popover-title">Paid</span>
                  <span className="badge badge-pro">Pro tiers</span>
                </div>
                {PRO_AGENTS.map((spec) => (
                  <AgentButton key={spec.type} spec={spec} size="row" onClick={() => spawn(spec.type)} />
                ))}
              </div>
            )}
          </div>

          <button
            className="btn btn-outline btn-sm"
            title="Swap to your other Claude account and restart Claude terminals in this workspace only"
            disabled={switching}
            onClick={handleSwitchAccount}
          >
            {switching ? 'Switching…' : 'Account'}
          </button>

          <div className="topbar-divider" />

          <button
            className={`btn btn-ghost btn-sm${rightTab === 'editor' ? ' is-active' : ''}`}
            onClick={() => toggleTab('editor')}
          >
            Editor
          </button>
          <button
            className={`btn btn-ghost btn-sm${rightTab === 'browser' ? ' is-active' : ''}`}
            onClick={() => toggleTab('browser')}
          >
            Browser
          </button>
        </div>
      </div>

      <div className="main-area" ref={containerRef}>
        <div className="terminals-area">
          {mainContent}
        </div>

        {rightTab !== null && (
          <>
            <div className="browser-resize-handle" onMouseDown={onDragStart} />
            <div className="right-panel" style={{ width: panelWidth, minWidth: panelWidth }}>
              <div className="right-panel-tabs">
                <button
                  className={`right-tab${rightTab === 'browser' ? ' active' : ''}`}
                  onClick={() => setRightTab('browser')}
                >Browser</button>
                <button
                  className={`right-tab${rightTab === 'editor' ? ' active' : ''}`}
                  onClick={() => setRightTab('editor')}
                >Editor</button>
                <button className="right-tab-close" onClick={() => setRightTab(null)}>Close</button>
              </div>
              <div className="right-panel-content">
                <div className="right-panel-pane" style={{ display: rightTab === 'browser' ? 'flex' : 'none' }}>
                  <BrowserPanel
                    onClose={() => setRightTab(null)}
                    isDragging={isDraggingPanel}
                    onApplyWidth={applyPanelWidth}
                  />
                </div>
                <div className="right-panel-pane" style={{ display: rightTab === 'editor' ? 'flex' : 'none' }}>
                  <EditorPanel rootPath={cwd} onClose={() => setRightTab(null)} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {toast && (
        <div className={`toast toast-${toast.kind}`}>{toast.text}</div>
      )}
    </div>
  );
}
