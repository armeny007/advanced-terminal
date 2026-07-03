// Статистика токенов и стоимости сессии по jsonl-транскрипту (V2).
import { createReadStream } from 'fs'
import { access, readdir } from 'fs/promises'
import { join } from 'path'
import { createInterface } from 'readline'
import type { ModelUsage, UsageStats } from '../../shared/types'
import { CLAUDE_PROJECTS_DIR } from '../paths'

/**
 * Цены $/MTok. Редактируемая таблица; матчинг — по подстроке в имени модели
 * (например, 'claude-opus-4-8' -> 'opus'). Неизвестная модель считается по ценам
 * sonnet с пометкой costIsEstimate.
 */
const PRICES: Record<string, { in: number; out: number; cacheWrite: number; cacheRead: number }> = {
  opus: { in: 15, out: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { in: 0.8, out: 4, cacheWrite: 1, cacheRead: 0.08 }
}
const FALLBACK_PRICE = PRICES['sonnet']

interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

function pickPrice(model: string): { price: typeof FALLBACK_PRICE; known: boolean } {
  const lower = model.toLowerCase()
  for (const [key, price] of Object.entries(PRICES)) {
    if (lower.includes(key)) return { price, known: true }
  }
  return { price: FALLBACK_PRICE, known: false }
}

async function findSessionFile(sessionId: string): Promise<string | null> {
  let subs: string[]
  try {
    subs = await readdir(CLAUDE_PROJECTS_DIR)
  } catch {
    return null
  }
  for (const sub of subs) {
    const p = join(CLAUDE_PROJECTS_DIR, sub, `${sessionId}.jsonl`)
    try {
      await access(p)
      return p
    } catch {
      // в этой директории нет — ищем дальше
    }
  }
  return null
}

export async function getUsage(
  _projectPath: string,
  sessionId: string
): Promise<UsageStats | null> {
  const file = await findSessionFile(sessionId)
  if (!file) return null

  // дедупликация стриминга: несколько строк на один message.id — учитываем последнюю
  const byId = new Map<string, { model: string; usage: RawUsage }>()
  let lineCounter = 0

  const rl = createInterface({
    input: createReadStream(file, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  for await (const line of rl) {
    if (!line.includes('"type":"assistant"')) continue
    let obj: {
      type?: string
      message?: { id?: string; model?: string; usage?: RawUsage }
    }
    try {
      obj = JSON.parse(line) as typeof obj
    } catch {
      continue
    }
    if (obj.type !== 'assistant') continue
    const msg = obj.message
    const usage = msg?.usage
    if (!usage || typeof usage !== 'object') continue
    lineCounter++
    const id = typeof msg.id === 'string' && msg.id ? msg.id : `line-${lineCounter}`
    byId.set(id, { model: typeof msg.model === 'string' ? msg.model : 'unknown', usage })
  }

  const byModel: Record<string, ModelUsage> = {}
  for (const { model, usage } of byId.values()) {
    let m = byModel[model]
    if (!m) {
      m = byModel[model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0,
        costIsEstimate: false
      }
    }
    m.inputTokens += usage.input_tokens ?? 0
    m.outputTokens += usage.output_tokens ?? 0
    m.cacheCreationTokens += usage.cache_creation_input_tokens ?? 0
    m.cacheReadTokens += usage.cache_read_input_tokens ?? 0
  }

  const total: UsageStats = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    costUsd: 0,
    costIsEstimate: false,
    byModel
  }
  for (const [model, m] of Object.entries(byModel)) {
    const { price, known } = pickPrice(model)
    m.costIsEstimate = !known
    m.costUsd =
      (m.inputTokens * price.in +
        m.outputTokens * price.out +
        m.cacheCreationTokens * price.cacheWrite +
        m.cacheReadTokens * price.cacheRead) /
      1_000_000
    total.inputTokens += m.inputTokens
    total.outputTokens += m.outputTokens
    total.cacheCreationTokens += m.cacheCreationTokens
    total.cacheReadTokens += m.cacheReadTokens
    total.costUsd += m.costUsd
    if (m.costIsEstimate) total.costIsEstimate = true
  }
  return total
}
