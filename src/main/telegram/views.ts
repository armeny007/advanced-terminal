// Чистый рендер экранов бота из состояния store: текст + inline-клавиатура.
import { Markup } from 'telegraf'
import type { ClaudeStatus, TermInfo } from '../../shared/types'
import type { Store } from '../contracts'

type Keyboard = ReturnType<typeof Markup.inlineKeyboard>
export interface View {
  text: string
  keyboard: Keyboard
}

const ICON: Record<ClaudeStatus, string> = {
  none: '⚪️',
  working: '🔵',
  idle: '🟢',
  needs_input: '🔴',
  permission: '🟠'
}

const LABEL: Record<ClaudeStatus, string> = {
  none: 'Claude не запущен',
  working: 'работает…',
  idle: 'готово',
  needs_input: 'ждёт ввода',
  permission: 'нужно разрешение'
}

export function statusIcon(s: ClaudeStatus): string {
  return ICON[s]
}

/** Краткий агрегат статусов папки для дашборда */
function aggregate(terms: TermInfo[]): string {
  if (terms.length === 0) return 'нет терминалов'
  const c: Partial<Record<ClaudeStatus, number>> = {}
  for (const t of terms) c[t.status] = (c[t.status] ?? 0) + 1
  const parts: string[] = []
  for (const s of ['needs_input', 'permission', 'working'] as ClaudeStatus[]) {
    if (c[s]) parts.push(`${ICON[s]}${c[s]}`)
  }
  if (parts.length === 0) return '🟢 всё готово'
  return parts.join(' · ')
}

function folderName(store: Store, folderId: string): string {
  const f = store.getState().folders.find((x) => x.id === folderId)
  return f ? `${f.icon ? f.icon + ' ' : ''}${f.name}` : 'папка'
}

/** Уровень 0 — дашборд по вкладкам */
export function dashboardView(store: Store): View {
  const st = store.getState()
  const lines = ['🖥 Advanced Terminal — сессии', '']
  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  let pair: ReturnType<typeof Markup.button.callback>[] = []
  for (const f of st.folders) {
    const terms = st.terminals.filter((t) => t.folderId === f.id)
    lines.push(`${f.icon ?? '•'} ${f.name} — ${aggregate(terms)}`)
    pair.push(Markup.button.callback(`${f.icon ?? '📁'} ${f.name}`, `f:${f.id}`))
    if (pair.length === 2) {
      rows.push(pair)
      pair = []
    }
  }
  if (pair.length) rows.push(pair)
  rows.push([Markup.button.callback('🔄 Обновить', 'root')])
  return { text: lines.join('\n'), keyboard: Markup.inlineKeyboard(rows) }
}

/** Уровень 1 — терминалы одной вкладки */
export function folderView(store: Store, folderId: string): View {
  const st = store.getState()
  const terms = st.terminals.filter((t) => t.folderId === folderId)
  const lines = [folderName(store, folderId), '']
  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  if (terms.length === 0) {
    lines.push('нет терминалов')
  } else {
    for (const t of terms) {
      lines.push(`${ICON[t.status]} ${t.name} — ${LABEL[t.status]}`)
      rows.push([Markup.button.callback(`${ICON[t.status]} ${t.name}`, `t:${t.id}`)])
    }
  }
  rows.push([
    Markup.button.callback('➕ Новый терминал', `a:addterm:${folderId}`),
    Markup.button.callback('⬅️ Назад', 'root')
  ])
  return { text: lines.join('\n'), keyboard: Markup.inlineKeyboard(rows) }
}

/** Клавиатура действий для карточки/пуша терминала */
export function terminalKeyboard(store: Store, termId: string): Keyboard {
  const t = store.getTerminal(termId)
  const showOut = store.getState().telegram.showOutputTail
  const rows: ReturnType<typeof Markup.button.callback>[][] = [
    [
      Markup.button.callback('✍️ Ответить', `a:reply:${termId}`),
      Markup.button.callback('✅ Да', `a:yes:${termId}`),
      Markup.button.callback('❌ Нет', `a:no:${termId}`)
    ],
    [
      Markup.button.callback('🆕 Новая', `a:new:${termId}`),
      Markup.button.callback('⏸ Продолжить', `a:cont:${termId}`),
      Markup.button.callback('♻️ Перезапуск', `a:restart:${termId}`)
    ],
    // навигация по интерактивным меню Claude (/model, /resume, многовариантные разрешения)
    [
      Markup.button.callback('⬆️', `a:up:${termId}`),
      Markup.button.callback('⬇️', `a:down:${termId}`),
      Markup.button.callback('🖥 Экран', `a:screen:${termId}`)
    ]
  ]
  if (t?.claudeSessionId) {
    rows.push([Markup.button.callback('▶️ Возобновить привязанную', `a:resume:${termId}`)])
  }
  const last: ReturnType<typeof Markup.button.callback>[] = []
  if (showOut) last.push(Markup.button.callback('📄 Вывод', `a:out:${termId}`))
  last.push(Markup.button.callback('⬅️ Назад', t ? `f:${t.folderId}` : 'root'))
  rows.push(last)
  return Markup.inlineKeyboard(rows)
}

/** Уровень 2 — карточка сессии */
export function terminalView(store: Store, termId: string): View | null {
  const t = store.getTerminal(termId)
  if (!t) return null
  const lines = [`${folderName(store, t.folderId)} › ${t.name}`, `${ICON[t.status]} ${LABEL[t.status]}`]
  return { text: lines.join('\n'), keyboard: terminalKeyboard(store, termId) }
}

/** Текст пуша «Claude ждёт тебя» */
export function attentionText(
  store: Store,
  termId: string,
  status: ClaudeStatus,
  message: string | undefined,
  completed: boolean
): string | null {
  const t = store.getTerminal(termId)
  if (!t) return null
  const head = completed && status === 'idle' ? '✅ Задача завершена' : `${ICON[status]} ${LABEL[status]}`
  const lines = [`🔔 ${folderName(store, t.folderId)} › ${t.name}`, head]
  if (message && message.trim()) lines.push('', `❓ ${message.trim()}`)
  return lines.join('\n')
}

/** Текстовый срез /status: всё, что требует внимания, по вкладкам */
export function statusSummary(store: Store): string {
  const st = store.getState()
  const need = st.terminals.filter((t) => t.status === 'needs_input' || t.status === 'permission')
  if (need.length === 0) return '🟢 Ничего не ждёт ввода.'
  const lines = ['Требуют внимания:']
  for (const t of need) lines.push(`${ICON[t.status]} ${folderName(store, t.folderId)} › ${t.name}`)
  return lines.join('\n')
}
