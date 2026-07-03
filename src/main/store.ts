// Персистентное хранилище состояния: JSON в userData, атомарная запись с дебаунсом.
import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { dirname, join } from 'path'
import type { Store } from './contracts'
import type { AppState, FolderInfo, ProjectConfig, TermInfo } from '../shared/types'

/** Персистируемая часть состояния (hooksInstalled не сохраняется) */
interface PersistedState {
  folders: FolderInfo[]
  terminals: TermInfo[]
  activeFolderId: string
  projectConfigs: Record<string, ProjectConfig>
  autoResumeSessions: boolean
}

const SAVE_DEBOUNCE_MS = 300

/** Палитра акцентов для папок; новые папки берут следующий по кругу цвет */
export const FOLDER_COLORS = ['#89b4fa', '#a6e3a1', '#fab387', '#f38ba8', '#cba6f7', '#94e2d5', '#f9e2af']

/** Три категории по умолчанию при первом запуске */
function defaultState(): PersistedState {
  const seed: FolderInfo[] = [
    { id: randomUUID(), name: 'Рабочее', color: '#89b4fa', icon: '💼' },
    { id: randomUUID(), name: 'Проекты', color: '#a6e3a1', icon: '🚀' },
    { id: randomUUID(), name: 'Общие вопросы', color: '#cba6f7', icon: '💬' }
  ]
  return { folders: seed, terminals: [], activeFolderId: seed[0].id, projectConfigs: {}, autoResumeSessions: false }
}

function loadState(file: string): PersistedState {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<PersistedState>
    if (!Array.isArray(raw.folders) || raw.folders.length === 0 || !Array.isArray(raw.terminals)) {
      return defaultState()
    }
    const folders = raw.folders
    const activeFolderId = folders.some((p) => p.id === raw.activeFolderId)
      ? (raw.activeFolderId as string)
      : folders[0].id
    // pty-процессы не переживают перезапуск приложения; claudeSessionId сохраняем
    const terminals = raw.terminals.map((t) => ({ ...t, alive: false, status: 'none' as const }))
    return {
      folders,
      terminals,
      activeFolderId,
      projectConfigs: raw.projectConfigs && typeof raw.projectConfigs === 'object' ? raw.projectConfigs : {},
      autoResumeSessions: raw.autoResumeSessions === true
    }
  } catch {
    return defaultState()
  }
}

export function createStore(): Store {
  const file = join(app.getPath('userData'), 'state.json')
  const persisted = loadState(file)

  const state: AppState = {
    folders: persisted.folders,
    terminals: persisted.terminals,
    activeFolderId: persisted.activeFolderId,
    hooksInstalled: false,
    detachedFolderIds: [],
    autoResumeSessions: persisted.autoResumeSessions
  }
  const projectConfigs = persisted.projectConfigs

  const listeners: Array<(s: AppState) => void> = []
  let saveTimer: NodeJS.Timeout | null = null

  function saveNow(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const data: PersistedState = {
      folders: state.folders,
      terminals: state.terminals,
      activeFolderId: state.activeFolderId,
      projectConfigs,
      autoResumeSessions: state.autoResumeSessions
    }
    try {
      mkdirSync(dirname(file), { recursive: true })
      const tmp = file + '.tmp'
      writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
      renameSync(tmp, file)
    } catch (err) {
      console.error('store: не удалось сохранить состояние', err)
    }
  }

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS)
  }

  function emit(): void {
    for (const cb of listeners) cb(state)
  }

  /** мутация персистентных данных: уведомить подписчиков и запланировать запись */
  function commit(): void {
    emit()
    scheduleSave()
  }

  app.on('before-quit', () => {
    if (saveTimer) saveNow()
  })

  return {
    getState: () => state,

    addFolder: (p) => {
      state.folders.push(p)
      commit()
    },
    renameFolder: (id, name) => {
      const p = state.folders.find((x) => x.id === id)
      if (!p) return
      p.name = name
      commit()
    },
    updateFolder: (id, patch) => {
      const p = state.folders.find((x) => x.id === id)
      if (!p) return
      if (patch.name !== undefined) p.name = patch.name
      if (patch.color !== undefined) p.color = patch.color
      if (patch.icon !== undefined) p.icon = patch.icon
      commit()
    },
    deleteFolder: (id) => {
      if (state.folders.length <= 1) return // последнюю папку удалять нельзя
      const idx = state.folders.findIndex((p) => p.id === id)
      if (idx === -1) return
      state.folders.splice(idx, 1)
      const target = state.folders[0]
      for (const t of state.terminals) {
        if (t.folderId === id) t.folderId = target.id
      }
      if (state.activeFolderId === id) state.activeFolderId = target.id
      commit()
    },
    setActiveFolder: (id) => {
      if (!state.folders.some((p) => p.id === id)) return
      state.activeFolderId = id
      commit()
    },

    addTerminal: (t) => {
      state.terminals.push(t)
      commit()
    },
    updateTerminal: (id, patch) => {
      const t = state.terminals.find((x) => x.id === id)
      if (!t) return undefined
      Object.assign(t, patch)
      commit()
      return t
    },
    removeTerminal: (id) => {
      const idx = state.terminals.findIndex((t) => t.id === id)
      if (idx === -1) return
      state.terminals.splice(idx, 1)
      commit()
    },
    getTerminal: (id) => state.terminals.find((t) => t.id === id),
    findTerminalBySession: (sessionId) =>
      state.terminals.find((t) => t.claudeSessionId === sessionId),

    setHooksInstalled: (v) => {
      state.hooksInstalled = v
      emit() // не персистится
    },
    setFolderDetached: (id, detached) => {
      const has = state.detachedFolderIds.includes(id)
      if (detached && !has) state.detachedFolderIds = [...state.detachedFolderIds, id]
      else if (!detached && has) state.detachedFolderIds = state.detachedFolderIds.filter((x) => x !== id)
      else return
      emit() // не персистится
    },
    setAutoResumeSessions: (v) => {
      if (state.autoResumeSessions === v) return
      state.autoResumeSessions = v
      commit()
    },

    getProjectConfig: (projectPath) =>
      projectConfigs[projectPath] ?? { projectPath, setupScript: '' },
    setProjectConfig: (cfg) => {
      projectConfigs[cfg.projectPath] = cfg
      commit()
    },

    onChange: (cb) => {
      listeners.push(cb)
    }
  }
}
