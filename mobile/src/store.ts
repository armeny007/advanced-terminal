// Состояние приложения: минимальный внешний стор на useSyncExternalStore (без зависимостей).
import { useSyncExternalStore } from 'react'
import type { HostMsg, MobileFolder, MobileTerm, ScreenSeg } from '../../src/shared/mobile-protocol'

export interface Attention {
  termId: string
  status: string
  message?: string
  completed: boolean
  at: number
}

export interface State {
  /** код сопряжения (advterm://pair?…) или null — не спарено */
  pairing: string | null
  /** есть соединение с релеем */
  connected: boolean
  /** Mac с приложением на связи */
  hostOnline: boolean
  folders: MobileFolder[]
  terminals: MobileTerm[]
  /** последний экран по терминалу */
  screens: Record<string, string>
  /** тот же экран со стилями (нет у старых версий приложения на Mac) */
  screenLines: Record<string, ScreenSeg[][] | undefined>
  attention: Attention | null
}

let state: State = {
  pairing: null,
  connected: false,
  hostOnline: false,
  folders: [],
  terminals: [],
  screens: {},
  screenLines: {},
  attention: null
}
const listeners = new Set<() => void>()

export function getState(): State {
  return state
}

export function setState(patch: Partial<State>): void {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function applyHostMsg(msg: HostMsg): void {
  if (msg.t === 'state') setState({ folders: msg.folders, terminals: msg.terminals })
  else if (msg.t === 'screen') {
    setState({
      screens: { ...state.screens, [msg.termId]: msg.text },
      screenLines: { ...state.screenLines, [msg.termId]: msg.lines }
    })
  }
  else if (msg.t === 'attention') {
    setState({
      attention: { termId: msg.termId, status: msg.status, message: msg.message, completed: msg.completed, at: Date.now() }
    })
  }
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => select(state)
  )
}
