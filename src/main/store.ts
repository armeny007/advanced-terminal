// Персистентное хранилище состояния: JSON в userData, атомарная запись с дебаунсом.
import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { dirname, join } from 'path'
import type { Store } from './contracts'
import type { AppState, PageInfo, ProjectConfig, TermInfo } from '../shared/types'

/** Персистируемая часть состояния (hooksInstalled не сохраняется) */
interface PersistedState {
  pages: PageInfo[]
  terminals: TermInfo[]
  activePageId: string
  projectConfigs: Record<string, ProjectConfig>
}

const SAVE_DEBOUNCE_MS = 300

function defaultState(): PersistedState {
  const page: PageInfo = { id: randomUUID(), name: 'Основная' }
  return { pages: [page], terminals: [], activePageId: page.id, projectConfigs: {} }
}

function loadState(file: string): PersistedState {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<PersistedState>
    if (!Array.isArray(raw.pages) || raw.pages.length === 0 || !Array.isArray(raw.terminals)) {
      return defaultState()
    }
    const pages = raw.pages
    const activePageId = pages.some((p) => p.id === raw.activePageId)
      ? (raw.activePageId as string)
      : pages[0].id
    // pty-процессы не переживают перезапуск приложения; claudeSessionId сохраняем
    const terminals = raw.terminals.map((t) => ({ ...t, alive: false, status: 'none' as const }))
    return {
      pages,
      terminals,
      activePageId,
      projectConfigs: raw.projectConfigs && typeof raw.projectConfigs === 'object' ? raw.projectConfigs : {}
    }
  } catch {
    return defaultState()
  }
}

export function createStore(): Store {
  const file = join(app.getPath('userData'), 'state.json')
  const persisted = loadState(file)

  const state: AppState = {
    pages: persisted.pages,
    terminals: persisted.terminals,
    activePageId: persisted.activePageId,
    hooksInstalled: false
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
      pages: state.pages,
      terminals: state.terminals,
      activePageId: state.activePageId,
      projectConfigs
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

    addPage: (p) => {
      state.pages.push(p)
      commit()
    },
    renamePage: (id, name) => {
      const p = state.pages.find((x) => x.id === id)
      if (!p) return
      p.name = name
      commit()
    },
    deletePage: (id) => {
      if (state.pages.length <= 1) return // последнюю страницу удалять нельзя
      const idx = state.pages.findIndex((p) => p.id === id)
      if (idx === -1) return
      state.pages.splice(idx, 1)
      const target = state.pages[0]
      for (const t of state.terminals) {
        if (t.pageId === id) t.pageId = target.id
      }
      if (state.activePageId === id) state.activePageId = target.id
      commit()
    },
    setActivePage: (id) => {
      if (!state.pages.some((p) => p.id === id)) return
      state.activePageId = id
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
