// ============================================================
// ЕДИНЫЙ КОНТРАКТ приложения: типы и IPC-каналы.
// Этот файл — источник истины для main, preload и renderer.
// Менять только согласованно со всеми модулями.
// ============================================================

/** Статус Claude Code в терминале (определяется через hooks) */
export type ClaudeStatus =
  | 'none' // Claude не запущен
  | 'working' // выполняет задачу
  | 'needs_input' // ждёт ввода пользователя
  | 'permission' // ждёт подтверждения разрешения
  | 'idle' // сессия активна, Claude закончил ход и ждёт команду

export interface FolderInfo {
  id: string
  name: string
  /** цвет-акцент вкладки (hex); если не задан — нейтральный */
  color?: string
  /** эмодзи-иконка вкладки */
  icon?: string
}

/** Изменяемые поля папки (для updateFolder) */
export type FolderPatch = Partial<Pick<FolderInfo, 'name' | 'color' | 'icon'>>

/** Привязка терминала к git worktree (V2) */
export interface WorktreeBinding {
  /** путь к основному репозиторию */
  projectPath: string
  worktreePath: string
  branch: string
}

export interface TermInfo {
  id: string
  folderId: string
  name: string
  cwd: string
  claudeSessionId: string | null
  status: ClaudeStatus
  worktree: WorktreeBinding | null
  createdAt: number
  /** жив ли pty-процесс (false после exit до перезапуска) */
  alive: boolean
}

export interface AppState {
  folders: FolderInfo[]
  terminals: TermInfo[]
  activeFolderId: string
  /** установлены ли hooks Claude Code (проверяется при старте) */
  hooksInstalled: boolean
}

/** Метаданные прошлой сессии из ~/.claude/projects/<dir>/<uuid>.jsonl */
export interface ClaudeSessionMeta {
  sessionId: string
  projectPath: string
  /** первое пользовательское сообщение — превью */
  firstMessage: string
  messageCount: number
  /** mtime файла, ms epoch */
  updatedAt: number
  gitBranch?: string
}

export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
  /** true, если модели не было в таблице цен и стоимость посчитана приблизительно */
  costIsEstimate: boolean
}

export interface UsageStats extends ModelUsage {
  byModel: Record<string, ModelUsage>
}

export interface WorktreeInfo {
  path: string
  branch: string
  head: string
}

export interface ProjectConfig {
  projectPath: string
  /** shell-скрипт, выполняемый в новом worktree после создания (установка зависимостей и т.п.) */
  setupScript: string
}

export type RunClaudeMode = 'new' | 'resume' | 'continue'

/** Событие смены статуса Claude в терминале (main -> renderer) */
export interface ClaudeStatusEvent {
  termId: string
  status: ClaudeStatus
  sessionId: string | null
  /** имя хука, вызвавшего переход (SessionStart, Stop, Notification, ...) */
  hookEvent: string
  /** текст Notification, если был */
  message?: string
}

// ============================================================
// IPC-каналы. invoke = renderer -> main c ответом,
// send = renderer -> main без ответа, on = main -> renderer.
// ============================================================
export const IPC = {
  // состояние
  stateGet: 'state:get', // invoke () => AppState
  stateChanged: 'state:changed', // on (AppState)

  // папки
  folderCreate: 'folder:create', // invoke (name) => FolderInfo
  folderRename: 'folder:rename', // invoke (id, name)
  folderUpdate: 'folder:update', // invoke (id, FolderPatch) — имя/цвет/иконка
  folderDelete: 'folder:delete', // invoke (id) — терминалы переносятся на первую папку
  folderSetActive: 'folder:setActive', // invoke (id)

  // терминалы
  termCreate: 'term:create', // invoke ({folderId, cwd?, name?}) => TermInfo
  termWrite: 'term:write', // send (id, data)
  termResize: 'term:resize', // send (id, cols, rows)
  termClose: 'term:close', // invoke (id)
  termRestart: 'term:restart', // invoke (id) => TermInfo — новый shell в том же cwd
  termRename: 'term:rename', // invoke (id, name)
  termMoveToFolder: 'term:moveToFolder', // invoke (id, folderId)
  termBindSession: 'term:bindSession', // invoke (id, sessionId | null)
  termRunClaude: 'term:runClaude', // invoke (id, mode: RunClaudeMode, sessionId?)
  termData: 'term:data', // on (id, data)
  termExit: 'term:exit', // on (id, exitCode)

  // claude
  claudeListSessions: 'claude:listSessions', // invoke (projectPath?) => ClaudeSessionMeta[]
  claudeUsage: 'claude:usage', // invoke (projectPath, sessionId) => UsageStats | null
  claudeInstallHooks: 'claude:installHooks', // invoke () => {ok, error?}
  claudeStatus: 'claude:status', // on (ClaudeStatusEvent)

  // ui
  uiSetFocusedTerm: 'ui:setFocusedTerm', // send (id | null) — для подавления уведомлений
  uiRevealTerm: 'ui:revealTerm', // on (termId) — клик по уведомлению

  // worktrees (V2)
  wtList: 'wt:list', // invoke (projectPath) => WorktreeInfo[]
  wtCreateTerminal: 'wt:createTerminal', // invoke ({folderId, projectPath, branch, name?}) => TermInfo
  wtRemove: 'wt:remove', // invoke (termId) => {ok, error?}
  wtDiff: 'wt:diff', // invoke (termId) => string (git diff против main)
  projectConfigGet: 'project:configGet', // invoke (projectPath) => ProjectConfig
  projectConfigSet: 'project:configSet' // invoke (ProjectConfig)
} as const

// ============================================================
// API, доступное renderer'у как window.api (реализовано в preload)
// ============================================================
export interface AdvTermApi {
  // состояние
  getState(): Promise<AppState>
  onStateChanged(cb: (s: AppState) => void): () => void

  // папки
  createFolder(name: string): Promise<FolderInfo>
  renameFolder(id: string, name: string): Promise<void>
  updateFolder(id: string, patch: FolderPatch): Promise<void>
  deleteFolder(id: string): Promise<void>
  setActiveFolder(id: string): Promise<void>

  // терминалы
  createTerminal(opts: { folderId: string; cwd?: string; name?: string }): Promise<TermInfo>
  writeTerminal(id: string, data: string): void
  resizeTerminal(id: string, cols: number, rows: number): void
  closeTerminal(id: string): Promise<void>
  restartTerminal(id: string): Promise<TermInfo>
  renameTerminal(id: string, name: string): Promise<void>
  moveTerminalToFolder(id: string, folderId: string): Promise<void>
  bindSession(id: string, sessionId: string | null): Promise<void>
  runClaude(id: string, mode: RunClaudeMode, sessionId?: string): Promise<void>
  onTermData(cb: (id: string, data: string) => void): () => void
  onTermExit(cb: (id: string, exitCode: number) => void): () => void

  // claude
  listClaudeSessions(projectPath?: string): Promise<ClaudeSessionMeta[]>
  getUsage(projectPath: string, sessionId: string): Promise<UsageStats | null>
  installHooks(): Promise<{ ok: boolean; error?: string }>
  onClaudeStatus(cb: (e: ClaudeStatusEvent) => void): () => void

  // ui
  setFocusedTerm(id: string | null): void
  onRevealTerm(cb: (termId: string) => void): () => void

  // worktrees (V2)
  listWorktrees(projectPath: string): Promise<WorktreeInfo[]>
  createWorktreeTerminal(opts: {
    folderId: string
    projectPath: string
    branch: string
    name?: string
  }): Promise<TermInfo>
  removeWorktree(termId: string): Promise<{ ok: boolean; error?: string }>
  worktreeDiff(termId: string): Promise<string>
  getProjectConfig(projectPath: string): Promise<ProjectConfig>
  setProjectConfig(cfg: ProjectConfig): Promise<void>
}
