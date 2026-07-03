// Статус-машина: читает файлы-события из спул-директории и обновляет статусы терминалов.
import { watch } from 'fs'
import { readFile, readdir, unlink } from 'fs/promises'
import { join } from 'path'
import type { ClaudeStatus, ClaudeStatusEvent, TermInfo } from '../../shared/types'
import { IPC } from '../../shared/types'
import type { Store } from '../contracts'
import { EVENTS_DIR } from '../paths'
import { send } from '../runtime'
import { notifyStatus } from './notifications'

interface EventPayload {
  session_id?: string
  cwd?: string
  message?: string
  [k: string]: unknown
}

let processing = false
let pending = false

export function startWatcher(store: Store): void {
  try {
    const w = watch(EVENTS_DIR, () => void scan(store))
    w.on('error', () => {})
  } catch {
    // директория недоступна — статусы просто не будут обновляться
  }
  // периодический поллинг: fs.watch иногда пропускает события (особенно под
  // нагрузкой из многих сессий) — иначе статус может «зависнуть» на working
  setInterval(() => void scan(store), 1000)
  // обработать файлы, накопившиеся до старта
  void scan(store)
}

/** Последовательно обрабатывает все файлы спула; повторные вызовы во время работы — один ре-скан */
async function scan(store: Store): Promise<void> {
  if (processing) {
    pending = true
    return
  }
  processing = true
  try {
    do {
      pending = false
      let files: string[]
      try {
        files = await readdir(EVENTS_DIR)
      } catch {
        return
      }
      // terminated: терминалы, у которых в этом скане уже был Stop/SessionEnd —
      // поздний PostToolUse того же хода (та же секунда, случайный порядок в имени)
      // не должен возвращать статус в working
      const terminated = new Set<string>()
      // сортировка по имени ~ по времени (префикс — unix timestamp)
      for (const f of files.filter((n) => n.endsWith('.json')).sort()) {
        try {
          await processFile(store, f, terminated)
        } catch {
          // watcher не должен падать никогда
        }
      }
    } while (pending)
  } finally {
    processing = false
  }
}

async function processFile(store: Store, fileName: string, terminated: Set<string>): Promise<void> {
  const full = join(EVENTS_DIR, fileName)
  let payload: EventPayload = {}
  try {
    const parsed: unknown = JSON.parse(await readFile(full, 'utf8'))
    if (typeof parsed === 'object' && parsed !== null) payload = parsed as EventPayload
  } catch {
    // битый JSON — файл всё равно удаляем ниже
  }
  await unlink(full).catch(() => {})

  // имя: <ts>_<rand>__<termId>__<event>.json
  const parts = fileName.slice(0, -'.json'.length).split('__')
  if (parts.length < 3) return
  const termId = parts[1]
  const hookEvent = parts[2]

  const term = store.getTerminal(termId)
  if (!term) return // терминал уже удалён

  const prev = term.status
  let status: ClaudeStatus
  const patch: Partial<TermInfo> = {}

  switch (hookEvent) {
    case 'SessionStart':
      status = 'idle'
      terminated.delete(termId) // началась новая активность
      // автопривязка сессии к терминалу
      if (typeof payload.session_id === 'string') patch.claudeSessionId = payload.session_id
      break
    case 'UserPromptSubmit':
      status = 'working'
      terminated.delete(termId) // началась новая активность
      break
    case 'PostToolUse':
      // Stop/SessionEnd этого хода уже обработан в этом скане — не воскрешаем working
      if (terminated.has(termId) || prev === 'working') return
      status = 'working'
      break
    case 'Notification': {
      const msg = (typeof payload.message === 'string' ? payload.message : '').toLowerCase()
      status = msg.includes('permission') || msg.includes('разрешен') ? 'permission' : 'needs_input'
      break
    }
    case 'Stop':
      status = 'idle'
      terminated.add(termId)
      break
    case 'SessionEnd':
      status = 'none' // claudeSessionId сохраняем
      terminated.add(termId)
      break
    default:
      return
  }

  patch.status = status
  const updated = store.updateTerminal(termId, patch)

  const ev: ClaudeStatusEvent = {
    termId,
    status,
    sessionId: updated?.claudeSessionId ?? term.claudeSessionId,
    hookEvent
  }
  if (typeof payload.message === 'string') ev.message = payload.message
  send(IPC.claudeStatus, ev)

  const completed = hookEvent === 'Stop' && prev === 'working'
  if (status === 'needs_input' || status === 'permission' || completed) {
    notifyStatus(store, termId, term.name, status, ev.message)
  }
}
