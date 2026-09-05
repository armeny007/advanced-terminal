// «📄 Вывод» для Telegram: последние сообщения сессии из её jsonl-транскрипта.
// Транскрипт лежит на диске — переживает заставку и перезапуски, в отличие от
// буфера pty, который под заставкой забивается запросами курсора TUI (ESC[6n)
// и после снятия ANSI остаётся пустым. И это чистый текст, а не сырой поток.
// Файлы бывают >100 МБ, поэтому читаем только хвост.
import { open, stat } from 'fs/promises'
import { findSessionFile } from '../claude/usage'

const TAIL_BYTES = 2 * 1024 * 1024
const MAX_MESSAGES = 6

interface Line {
  isSidechain?: boolean
  isMeta?: boolean
  message?: { role?: string; content?: unknown }
}

/** Все текстовые блоки сообщения, склеенные; tool_use/tool_result пропускаем */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const b of content as { type?: string; text?: string }[]) {
    if (b && b.type === 'text' && typeof b.text === 'string') parts.push(b.text)
  }
  return parts.join('\n')
}

/** Служебное (команды, caveat, «продолжение после compact») — не показываем */
function isNoise(t: string): boolean {
  const s = t.trim()
  return (
    s === '' ||
    s.startsWith('<command-') ||
    s.startsWith('<local-command') ||
    s.startsWith('Caveat:') ||
    s.startsWith('This session is being continued')
  )
}

async function readTail(file: string): Promise<{ chunk: string; truncated: boolean }> {
  const { size } = await stat(file)
  const start = Math.max(0, size - TAIL_BYTES)
  const fh = await open(file, 'r')
  try {
    const buf = Buffer.alloc(size - start)
    await fh.read(buf, 0, buf.length, start)
    return { chunk: buf.toString('utf8'), truncated: start > 0 }
  } finally {
    await fh.close()
  }
}

/** Последние сообщения сессии как «👤 …» / «🤖 …»; null — если сессии или текста нет */
export async function sessionTail(sessionId: string, maxChars = 3500): Promise<string | null> {
  const file = await findSessionFile(sessionId)
  if (!file) return null
  const { chunk, truncated } = await readTail(file)
  const lines = chunk.split('\n')
  if (truncated) lines.shift() // первая строка могла быть разрезана посередине
  const msgs: string[] = []
  for (let i = lines.length - 1; i >= 0 && msgs.length < MAX_MESSAGES; i--) {
    const ln = lines[i]
    if (!ln) continue
    let o: Line
    try {
      o = JSON.parse(ln) as Line
    } catch {
      continue // обрезанная строка — файл может дописываться прямо сейчас
    }
    if (o.isSidechain || o.isMeta) continue
    const role = o.message?.role
    if (role !== 'user' && role !== 'assistant') continue
    const t = textOf(o.message?.content)
    if (isNoise(t)) continue
    msgs.push(`${role === 'user' ? '👤' : '🤖'} ${t.trim()}`)
  }
  if (msgs.length === 0) return null
  let out = msgs.reverse().join('\n\n')
  if (out.length > maxChars) out = '…' + out.slice(out.length - maxChars)
  return out
}
