// Протокол «приложение на Mac (host) ↔ мобильное приложение (client)» через релей.
// Сообщения — JSON, зашифрованный на концах (ChaCha20-Poly1305, ключ из секрета сопряжения).
// Этот файл импортируется мобильным приложением (mobile/) только как типы — держать без кода.
import type { ClaudeStatus } from './types'

export interface MobileFolder {
  id: string
  name: string
  icon?: string
  color?: string
}

export interface MobileTerm {
  id: string
  folderId: string
  name: string
  status: ClaudeStatus
  cwd: string
  sshHost?: string | null
  claudeSessionId: string | null
  archived?: boolean
  alive: boolean
}

/** кусок строки экрана с одинаковым стилем; цвета — '#rrggbb', без поля — цвет по умолчанию */
export interface ScreenSeg {
  s: string
  fg?: string
  bg?: string
  /** bold */
  b?: 1
  /** dim */
  d?: 1
  /** inverse (fg/bg меняются местами на клиенте — он знает цвета по умолчанию) */
  i?: 1
}

/** host → client */
export type HostMsg =
  | { t: 'state'; folders: MobileFolder[]; terminals: MobileTerm[] }
  /** текущий экран терминала — для подписанного терминала. text — без ANSI (для старых клиентов),
   *  lines — те же строки со стилями: без них не видно выделения в меню Claude (оно только цветом) */
  | { t: 'screen'; termId: string; text: string; lines?: ScreenSeg[][] }
  | { t: 'attention'; termId: string; status: ClaudeStatus; message?: string; completed: boolean }

export type MobileKey = 'enter' | 'esc' | 'up' | 'down' | 'left' | 'right' | 'tab' | 'ctrl-c'

/** client → host */
export type ClientMsg =
  | { t: 'hello' }
  /** следить за экраном терминала (null — отписаться) */
  | { t: 'sub'; termId: string | null }
  | { t: 'prompt'; termId: string; text: string }
  | { t: 'key'; termId: string; key: MobileKey }
  | { t: 'claude'; termId: string; mode: 'new' | 'continue' | 'resume' | 'restart' }
  | { t: 'archive'; termId: string; archived: boolean }
  | { t: 'newterm'; folderId: string }

/** Код сопряжения, который показывается в QR: advterm://pair?relay=…&key=… */
export const PAIR_SCHEME = 'advterm://pair'
