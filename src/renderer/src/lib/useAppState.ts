import { useEffect, useState } from 'react'
import type { AppState } from '../../../shared/types'
import { DEFAULT_CLAUDE_LAUNCH, DEFAULT_TELEGRAM } from '../../../shared/types'

const EMPTY: AppState = {
  folders: [],
  terminals: [],
  activeFolderId: '',
  hooksInstalled: true,
  detachedFolderIds: [],
  autoResumeSessions: false,
  claudeLaunch: DEFAULT_CLAUDE_LAUNCH,
  telegram: DEFAULT_TELEGRAM
}

/** Состояние приложения из main: getState при старте + подписка на изменения */
export function useAppState(): AppState {
  const [state, setState] = useState<AppState>(EMPTY)

  useEffect(() => {
    let mounted = true
    window.api.getState().then((s) => {
      if (mounted) setState(s)
    })
    const off = window.api.onStateChanged((s) => setState(s))
    return () => {
      mounted = false
      off()
    }
  }, [])

  return state
}
