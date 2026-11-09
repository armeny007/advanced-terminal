// Вопросы сессий Claude владельцу (панель «Вопросы»). Два источника:
//  - команда advterm-ask из сессии — событие `question` в том же спуле, что hooks;
//  - перехваченный инструмент AskUserQuestion — хуки PreToolUse/PostToolUse.
// Ответ владельца уходит в сессию: cli — текстом как промпт, tool — клавишами меню TUI
// (цифра варианта; «Type something» = цифра N+1, текст, Enter; при нескольких вопросах
// в одном вызове — по порядку, в конце Enter на экране «Submit answers»).
import { createHash } from 'crypto'
import type { Question, QuestionAnswer } from '../../shared/types'
import type { PtyManager, Store } from '../contracts'
import { sendPrompt } from '../telegram/actions'

const CR = '\r'
const KEY_DELAY_MS = 250

interface Deps {
  store: Store
  pty: PtyManager
}

// подписчики на появление/обновление вопроса (Telegram-бот, мобильное приложение)
type QuestionListener = (q: Question, kind: 'new' | 'updated') => void
const listeners = new Set<QuestionListener>()

/** Подписаться на новые и обновлённые вопросы; возвращает функцию отписки */
export function onQuestion(cb: QuestionListener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function notify(q: Question, kind: 'new' | 'updated'): void {
  for (const l of listeners) {
    try {
      l(q, kind)
    } catch {
      // подписчик не должен ронять watcher
    }
  }
}

/** короткий стабильный ключ вопроса — для callback-кнопок Telegram (лимит 64 байта) */
export function questionKey(id: string): string {
  return createHash('sha1').update(id).digest('hex').slice(0, 12)
}

export function findQuestionByKey(store: Store, key: string): Question | undefined {
  return store.getState().questions.find((q) => questionKey(q.id) === key)
}

/** поля advterm-ask приходят в base64 — JSON без экранирования в bash */
const b64 = (v: unknown): string => (typeof v === 'string' ? Buffer.from(v, 'base64').toString('utf8') : '')

/** событие `question` от advterm-ask: {op: add|update|close, id, title, detail, options, result} */
export function handleAskEvent(store: Store, termId: string, payload: Record<string, unknown>): void {
  const key = typeof payload.id === 'string' ? payload.id : ''
  if (!key) return
  const id = `${termId}:${key}`
  if (payload.op === 'close') {
    store.removeQuestion(id)
    return
  }
  const title = b64(payload.title)
  const detail = b64(payload.detail)
  const options = b64(payload.options)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => ({ label }))
  const prev = store.getState().questions.find((q) => q.id === id)
  if (payload.op === 'update') {
    if (!prev) return
    const patch: Partial<Question> = {}
    if (title) patch.title = title
    if (detail) patch.detail = detail
    if (options.length) patch.options = options
    const updated = store.updateQuestion(id, patch)
    if (updated) notify(updated, 'updated')
    return
  }
  if (payload.op !== 'add' || !title) return
  const q: Question = {
    id,
    termId,
    source: 'cli',
    title,
    detail,
    options,
    state: 'open',
    createdAt: prev?.createdAt ?? Date.now()
  }
  store.upsertQuestion(q)
  notify(q, prev ? 'updated' : 'new')
}

interface ToolQuestion {
  question?: string
  header?: string
  options?: { label?: string; description?: string }[]
  multiSelect?: boolean
}

/** хуки инструмента AskUserQuestion: PreToolUse — показать вопросы, PostToolUse — инструмент получил ответ */
export function handleToolQuestion(
  store: Store,
  termId: string,
  hookEvent: 'PreToolUse' | 'PostToolUse',
  payload: Record<string, unknown>
): void {
  const toolUseId = typeof payload.tool_use_id === 'string' ? payload.tool_use_id : ''
  if (!toolUseId) return
  if (hookEvent === 'PostToolUse') {
    for (const q of store.getState().questions.filter((x) => x.tool?.toolUseId === toolUseId))
      store.removeQuestion(q.id)
    return
  }
  const input = payload.tool_input as { questions?: ToolQuestion[] } | undefined
  const qs = Array.isArray(input?.questions) ? input.questions : []
  qs.forEach((tq, index) => {
    const q: Question = {
      id: `${toolUseId}:${index}`,
      termId,
      source: 'tool',
      title: tq.question ?? '',
      detail: '',
      options: (tq.options ?? []).map((o) => ({ label: o.label ?? '', description: o.description })),
      state: 'open',
      createdAt: Date.now(),
      tool: { toolUseId, index, count: qs.length, multiSelect: tq.multiSelect === true }
    }
    store.upsertQuestion(q)
    notify(q, 'new')
  })
}

/** вопросы инструмента живут только пока ход не закончен (Stop): после — меню TUI уже нет */
export function clearToolQuestions(store: Store, termId: string): void {
  for (const q of store.getState().questions.filter((x) => x.termId === termId && x.source === 'tool')) {
    store.removeQuestion(q.id)
  }
}

/** false — ответ не применён: вопроса уже нет или (tool) сначала нужно ответить на предыдущий */
export function answerQuestion(deps: Deps, id: string, answer: QuestionAnswer): boolean {
  const q = deps.store.getState().questions.find((x) => x.id === id)
  if (!q) return false
  if (q.source === 'tool') return answerTool(deps, q, answer)
  answerCli(deps, q, answer)
  return true
}

function answerCli({ store, pty }: Deps, q: Question, answer: QuestionAnswer): void {
  const ref = `вопрос ${q.id.slice(q.termId.length + 1)} («${q.title}»)`
  let text: string
  switch (answer.kind) {
    case 'yes':
      text = `Ответ на ${ref}: да`
      break
    case 'no':
      text = `Ответ на ${ref}: нет`
      break
    case 'text':
      text = `Ответ на ${ref}: ${answer.text}`
      break
    case 'option':
      text = `Ответ на ${ref}: ${q.options[answer.index]?.label ?? ''}`
      break
    case 'defer':
      text = `${ref[0].toUpperCase()}${ref.slice(1)} откладываем: продолжай по своему допущению, вопрос оставь открытым`
      break
    case 'explain':
      text = `Поясни подробнее ${ref} и обнови его объяснение через advterm-ask update`
      break
  }
  sendPrompt({ store, pty }, q.termId, text)
  if (answer.kind === 'defer') store.updateQuestion(q.id, { state: 'deferred' })
  else if (answer.kind !== 'explain') store.removeQuestion(q.id)
}

function answerTool({ store, pty }: Deps, q: Question, answer: QuestionAnswer): boolean {
  const t = q.tool
  if (!t) return false
  const siblings = store.getState().questions.filter((x) => x.tool?.toolUseId === t.toolUseId)
  // TUI показывает вопросы по очереди — отвечать можно только на первый неотвеченный
  if (siblings.some((x) => x.tool && x.tool.index < t.index)) return false
  const keys: string[] = []
  if (answer.kind === 'option') keys.push(String(answer.index + 1))
  else if (answer.kind === 'text') keys.push(String(q.options.length + 1), answer.text, CR)
  else return false
  if (t.multiSelect) keys.push(CR)
  const last = !siblings.some((x) => x.tool && x.tool.index > t.index)
  if (last && t.count > 1) keys.push(CR) // «Submit answers»
  keys.forEach((k, i) => setTimeout(() => pty.writeRaw(q.termId, k), i * KEY_DELAY_MS))
  store.removeQuestion(q.id)
  return true
}
