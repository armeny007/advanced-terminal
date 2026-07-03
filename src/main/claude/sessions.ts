// Браузер прошлых сессий: сканирует ~/.claude/projects/*/*.jsonl.
import { createReadStream } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import { createInterface } from 'readline'
import type { ClaudeSessionMeta } from '../../shared/types'
import { CLAUDE_PROJECTS_DIR } from '../paths'

/** превью (cwd, gitBranch, первое сообщение) ищем только в начале файла */
const PREVIEW_LINES = 100
const MAX_SESSIONS = 500
const PARSE_CONCURRENCY = 8

interface CacheEntry {
  mtimeMs: number
  meta: ClaudeSessionMeta | null
}

// кэш по (path, mtime): при неизменном файле повторный парсинг не нужен
const cache = new Map<string, CacheEntry>()

/** Строка jsonl-транскрипта (только интересующие нас поля) */
interface TranscriptLine {
  type?: string
  isMeta?: boolean
  isSidechain?: boolean
  cwd?: string
  gitBranch?: string
  message?: { role?: string; content?: unknown }
}

function extractText(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    for (const block of content) {
      const b = block as { type?: string; text?: string }
      if (b && typeof b === 'object' && b.type === 'text' && typeof b.text === 'string') {
        return b.text
      }
    }
  }
  return null
}

/** Команды-метаданные ('<command-name>/clear</command-name>' и т.п.) — не превью */
function isMetaText(text: string): boolean {
  const t = text.trim()
  return t === '' || t.startsWith('<command-') || t.startsWith('<local-command')
}

async function parseFile(
  filePath: string,
  sessionId: string,
  mtimeMs: number
): Promise<ClaudeSessionMeta | null> {
  let firstMessage = ''
  let projectPath = ''
  let gitBranch: string | undefined
  let userCount = 0
  let assistantCount = 0
  let lineNo = 0

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  for await (const line of rl) {
    lineNo++
    // messageCount — по подстрокам, без JSON.parse каждой строки
    if (line.includes('"type":"user"')) userCount++
    else if (line.includes('"type":"assistant"')) assistantCount++

    if (lineNo > PREVIEW_LINES || (firstMessage && projectPath && gitBranch)) continue
    let obj: TranscriptLine
    try {
      obj = JSON.parse(line) as TranscriptLine
    } catch {
      continue
    }
    if (!projectPath && typeof obj.cwd === 'string') projectPath = obj.cwd
    if (!gitBranch && typeof obj.gitBranch === 'string' && obj.gitBranch) gitBranch = obj.gitBranch
    if (
      !firstMessage &&
      obj.type === 'user' &&
      !obj.isMeta &&
      !obj.isSidechain &&
      obj.message?.role === 'user'
    ) {
      const text = extractText(obj.message.content)
      if (text && !isMetaText(text)) firstMessage = text.trim().slice(0, 200)
    }
  }

  // сессии без единого содержательного пользовательского сообщения пропускаем
  if (!firstMessage) return null
  const meta: ClaudeSessionMeta = {
    sessionId,
    projectPath,
    firstMessage,
    messageCount: userCount + assistantCount,
    updatedAt: mtimeMs
  }
  if (gitBranch) meta.gitBranch = gitBranch
  return meta
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

export async function listSessions(projectPath?: string): Promise<ClaudeSessionMeta[]> {
  let dirs
  try {
    dirs = await readdir(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
  } catch {
    return []
  }

  const candidates: { path: string; sessionId: string; mtimeMs: number }[] = []
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const dirPath = join(CLAUDE_PROJECTS_DIR, d.name)
    let files: string[]
    try {
      files = await readdir(dirPath)
    } catch {
      continue
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue
      const p = join(dirPath, f)
      try {
        const st = await stat(p)
        candidates.push({ path: p, sessionId: f.slice(0, -'.jsonl'.length), mtimeMs: st.mtimeMs })
      } catch {
        // файл исчез между readdir и stat
      }
    }
  }

  // ограничиваем 500 последними по mtime — тысячи сессий не парсим
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const limited = candidates.slice(0, MAX_SESSIONS)

  const metas = await mapLimit(limited, PARSE_CONCURRENCY, async (c) => {
    const hit = cache.get(c.path)
    if (hit && hit.mtimeMs === c.mtimeMs) return hit.meta
    let meta: ClaudeSessionMeta | null = null
    try {
      meta = await parseFile(c.path, c.sessionId, c.mtimeMs)
    } catch {
      // нечитаемый файл — пропускаем
    }
    cache.set(c.path, { mtimeMs: c.mtimeMs, meta })
    return meta
  })

  return metas
    .filter((m): m is ClaudeSessionMeta => m !== null)
    .filter((m) => !projectPath || m.projectPath === projectPath)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}
