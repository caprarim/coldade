import type { AgentType } from './agents';

export type { AgentType };

export interface WorkspaceInfo {
  id: string;
  name: string;
  configDir?: string;
}

export interface AgentInstance {
  id: string;
  type: AgentType;
  name: string;
  command: string;
  status: 'starting' | 'running' | 'exited' | 'error';
  pid?: number;
  cwd: string;
  workspaceId?: string;
}

export interface PtyCreateOptions {
  id: string;
  /** The command that launches the agent once it is installed. */
  command: string;
  cwd: string;
  cols: number;
  rows: number;
  workspaceId?: string;
  configDir?: string;
  /**
   * Executable to probe before launching. When `bin` and `install` are both
   * present the terminal runs a bootstrap that installs the CLI if it is
   * missing, then launches it. Omit both to run `command` verbatim.
   */
  bin?: string;
  /** PowerShell that installs the CLI when `bin` is not found. */
  install?: string;
  /** Shown in the terminal while installing, e.g. "Gemini". */
  label?: string;
}

export interface PtyCreateResult {
  success: boolean;
  pid?: number;
  error?: string;
}

export interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface FsReadDirResult {
  entries: FsEntry[];
  error?: string;
}

export interface FsReadFileResult {
  content: string;
  error?: string;
}

export interface FsWriteFileResult {
  success: boolean;
  error?: string;
}
