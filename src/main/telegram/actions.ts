// Операции управления сессиями из бота. Всё идёт через PtyManager/Store — тот же
// код, что и UI (см. pty.ts). Полное управление доступно только спаренным аккаунтам.
import { buildClaudeArgs } from '../../shared/claude-args'
import type { PtyManager, Store } from '../contracts'
import { formatOutputTail } from './output'
import { sessionTail } from './transcript'

const CR = String.fromCharCode(13) // Enter (\r)
const ESC = String.fromCharCode(27) // Escape

export interface ActionDeps {
  store: Store
  pty: PtyManager
}

/**
 * Отправить текст как ввод/промпт в сессию. Текст и Enter шлём РАЗДЕЛЬНО: если \r
 * приходит в одном чанке с текстом, TUI Claude Code считает это вставкой (paste) и
 * вставляет перенос строки вместо отправки — промпт зависает в строке ввода.
 * Многострочный текст оборачиваем в bracketed paste, чтобы переносы внутри него
 * не сработали как Enter.
 */
export function sendPrompt({ pty }: ActionDeps, termId: string, text: string): void {
  const body = text.includes('\n') ? `${ESC}[200~${text}${ESC}[201~` : text
  pty.writeToTerminal(termId, body)
  setTimeout(() => pty.writeToTerminal(termId, CR), 150)
}

/** Стрелка в интерактивном меню Claude (/model, /resume…); статус не трогаем — это навигация */
export function arrow({ pty }: ActionDeps, termId: string, dir: 'up' | 'down'): void {
  pty.writeRaw(termId, ESC + (dir === 'up' ? '[A' : '[B'))
}

/** Сырой экран терминала (последний вывод, моноширинно) — тут видно TUI-меню и подсказки */
export function screenTail({ pty }: ActionDeps, termId: string): string {
  return formatOutputTail(pty.getRecentOutput(termId))
}

/** Быстрый ответ на запрос: Да = Enter (принять/по умолчанию), Нет = Esc (отмена) */
export function quickAnswer({ pty }: ActionDeps, termId: string, yes: boolean): void {
  pty.writeToTerminal(termId, yes ? CR : ESC)
}

export function newSession({ store, pty }: ActionDeps, termId: string): void {
  pty.runClaude(termId, 'new', undefined, buildClaudeArgs(store.getState().claudeLaunch))
}

export function continueSession({ store, pty }: ActionDeps, termId: string): void {
  pty.runClaude(termId, 'continue', undefined, buildClaudeArgs(store.getState().claudeLaunch))
}

/** true, если удалось (была привязанная сессия) */
export function resumeSession({ store, pty }: ActionDeps, termId: string): boolean {
  const t = store.getTerminal(termId)
  if (!t?.claudeSessionId) return false
  pty.runClaude(termId, 'resume', t.claudeSessionId, buildClaudeArgs(store.getState().claudeLaunch))
  return true
}

export function restart({ pty }: ActionDeps, termId: string): boolean {
  return pty.restartTerminal(termId) !== undefined
}

export function createTerminal({ pty }: ActionDeps, folderId: string): string {
  return pty.createTerminal({ folderId }).id
}

/**
 * «Вывод»: последние сообщения привязанной сессии из транскрипта (надёжно, читаемо);
 * если сессии/транскрипта нет — сырой хвост терминала (mono = показывать моноширинно).
 */
export async function outputTail(
  { store, pty }: ActionDeps,
  termId: string
): Promise<{ text: string; mono: boolean }> {
  const t = store.getTerminal(termId)
  if (t?.claudeSessionId) {
    const tail = await sessionTail(t.claudeSessionId)
    if (tail) return { text: tail, mono: false }
  }
  return { text: formatOutputTail(pty.getRecentOutput(termId)), mono: true }
}
