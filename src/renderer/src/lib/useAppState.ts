import { useEffect, useState } from 'react'
import type { AppState } from '../../../shared/types'

const EMPTY: AppState = {
  folders: [],
  terminals: [],
  activeFolderId: '',
  hooksInstalled: true,
  detachedFolderIds: [],
  autoResumeSessions: false
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
