// Установка hooks Claude Code на удалённый ssh-хост: читаем его ~/.claude/settings.json,
// сливаем локально (та же логика, что для своей машины), записываем обратно вместе с hook.sh.
import { execFile } from 'child_process'
import { promisify } from 'util'
import { HOOK_SCRIPT_CONTENT, mergeHooks, parseSettings } from './hooks'

const run = promisify(execFile)
const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15']
const b64 = (s: string): string => Buffer.from(s).toString('base64')

export async function installRemoteHooks(host: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { stdout } = await run(
      'ssh',
      [...SSH_OPTS, host, 'echo "$HOME"; cat "$HOME/.claude/settings.json" 2>/dev/null'],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }
    )
    const nl = stdout.indexOf('\n')
    const home = stdout.slice(0, nl).trim()
    if (!home) return { ok: false, error: 'не удалось определить $HOME на хосте' }
    const settings = parseSettings(stdout.slice(nl + 1))
    const changed = mergeHooks(settings, `${home}/.advanced-terminal/hook.sh`)

    // hook.sh перезаписываем всегда (версия скрипта), settings.json — только если менялся;
    // перед первой правкой settings.json сохраняем бэкап, как и локально
    const parts = [
      `mkdir -p "$HOME/.advanced-terminal" "$HOME/.claude"`,
      `echo ${b64(HOOK_SCRIPT_CONTENT)} | base64 --decode > "$HOME/.advanced-terminal/hook.sh"`,
      `chmod +x "$HOME/.advanced-terminal/hook.sh"`
    ]
    if (changed) {
      parts.push(
        `{ [ -e "$HOME/.claude/settings.json.advterm-backup" ] || [ ! -e "$HOME/.claude/settings.json" ] || cp "$HOME/.claude/settings.json" "$HOME/.claude/settings.json.advterm-backup"; }`,
        `echo ${b64(JSON.stringify(settings, null, 2) + '\n')} | base64 --decode > "$HOME/.claude/settings.json"`
      )
    }
    await run('ssh', [...SSH_OPTS, host, parts.join(' && ')], { timeout: 30_000 })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
