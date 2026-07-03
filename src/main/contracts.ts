// Интерфейсы модулей main-процесса. Реализации: store.ts (Store), pty.ts (PtyManager).
import type {
  AppState,
  ClaudeLaunchOptions,
  FolderInfo,
  FolderPatch,
  ProjectConfig,
  TermInfo,
  WorktreeBinding
} from '../shared/types'

export interface Store {
  getState(): AppState

  addFolder(p: FolderInfo): void
  renameFolder(id: string, name: string): void
  updateFolder(id: string, patch: FolderPatch): void
  /** терминалы удаляемой папки переносятся на первую оставшуюся */
  deleteFolder(id: string): void
  setActiveFolder(id: string): void

  addTerminal(t: TermInfo): void
  updateTerminal(id: string, patch: Partial<TermInfo>): TermInfo | undefined
  removeTerminal(id: string): void
  getTerminal(id: string): TermInfo | undefined
  findTerminalBySession(sessionId: string): TermInfo | undefined

  setHooksInstalled(v: boolean): void
  setFolderDetached(id: string, detached: boolean): void
  setAutoResumeSessions(v: boolean): void
  setClaudeLaunch(opts: ClaudeLaunchOptions): void

  getProjectConfig(projectPath: string): ProjectConfig
  setProjectConfig(cfg: ProjectConfig): void

  /** подписка на любое изменение состояния (для broadcast в renderer) */
  onChange(cb: (s: AppState) => void): void
}

export interface CreateTerminalOpts {
  folderId: string
  cwd?: string
  name?: string
  worktree?: WorktreeBinding | null
}

export interface PtyManager {
  /** создаёт запись в store и запускает shell */
  createTerminal(opts: CreateTerminalOpts): TermInfo
  writeToTerminal(id: string, data: string): void
  /** убивает pty; запись в store не трогает */
  killTerminal(id: string): void
}
