/// <reference types="vite/client" />
import type { AdvTermApi } from '../../shared/types'

declare global {
  interface Window {
    api: AdvTermApi
  }
}

export {}
