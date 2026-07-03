// Установка hooks Claude Code в ~/.claude/settings.json и генерация hook-скрипта.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { CLAUDE_SETTINGS, HOOK_SCRIPT } from '../paths'

/** События, на которые ставится наш хук */
const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'Stop',
  'Notification',
  'SessionEnd',
  'PostToolUse'
] as const

/** Минимум событий, при которых статус-машина работоспособна */
const REQUIRED_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Stop', 'Notification'] as const

/** Наш хук опознаётся по этой подстроке в command (идемпотентность) */
const HOOK_MARKER = '.advanced-terminal/hook.sh'

const BACKUP_PATH = CLAUDE_SETTINGS + '.advterm-backup'

/** Содержимое hook.sh: пишет событие hooks Claude Code в спул-директорию */
export const HOOK_SCRIPT_CONTENT = `#!/bin/bash
# Advanced Terminal: пересылает события hooks Claude Code в приложение
[ -n "$ADVTERM_TERM_ID" ] || exit 0
dir="\${ADVTERM_EVENTS_DIR:-$HOME/.advanced-terminal/events}"
mkdir -p "$dir" 2>/dev/null || exit 0
f="$dir/$(date +%s)_\${RANDOM}__\${ADVTERM_TERM_ID}__\${1:-unknown}.json"
cat > "$f.tmp" 2>/dev/null && mv "$f.tmp" "$f" 2>/dev/null
exit 0
`

interface HookCommand {
  type?: string
  command?: string
  [k: string]: unknown
}

interface HookGroup {
  matcher?: string
  hooks?: HookCommand[]
  [k: string]: unknown
}

type SettingsJson = Record<string, unknown> & { hooks?: Record<string, HookGroup[]> }

function hasOurHook(groups: HookGroup[]): boolean {
  return groups.some(
    (g) =>
      Array.isArray(g.hooks) &&
      g.hooks.some((h) => typeof h.command === 'string' && h.command.includes(HOOK_MARKER))
  )
}

/** Идемпотентно добавляет наш хук во все HOOK_EVENTS, не трогая чужие hooks */
export function installHooks(): { ok: boolean; error?: string } {
  try {
    let raw: string | null = null
    try {
      raw = readFileSync(CLAUDE_SETTINGS, 'utf8')
    } catch {
      // файла нет — создадим
    }
    let settings: SettingsJson = {}
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ok: false, error: 'settings.json имеет неожиданный формат' }
      }
      settings = parsed as SettingsJson
    }

    if (typeof settings.hooks !== 'object' || settings.hooks === null) settings.hooks = {}
    const hooks = settings.hooks

    let changed = false
    for (const event of HOOK_EVENTS) {
      if (!Array.isArray(hooks[event])) hooks[event] = []
      const groups = hooks[event]
      if (hasOurHook(groups)) continue
      const entry: HookGroup = {
        hooks: [{ type: 'command', command: `${HOOK_SCRIPT} ${event}` }]
      }
      if (event === 'PostToolUse') entry.matcher = '*'
      groups.push(entry)
      changed = true
    }

    if (changed) {
      // бэкап оригинала — один раз, перед первым нашим изменением
      if (raw !== null && !existsSync(BACKUP_PATH)) writeFileSync(BACKUP_PATH, raw)
      mkdirSync(dirname(CLAUDE_SETTINGS), { recursive: true })
      writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2) + '\n')
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** true, если наш хук стоит на всех обязательных событиях */
export function hooksInstalled(): boolean {
  try {
    const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, 'utf8')) as SettingsJson
    const hooks = settings.hooks
    if (typeof hooks !== 'object' || hooks === null) return false
    return REQUIRED_EVENTS.every((ev) => Array.isArray(hooks[ev]) && hasOurHook(hooks[ev]))
  } catch {
    return false
  }
}
