import { homedir } from 'os'
import { join } from 'path'

/** служебная директория приложения (без пробелов в пути — используется в hook-скрипте);
 *  ADVTERM_DIR позволяет изолировать спул и скрипты (напр. для тестов, вместе с ADVTERM_USERDATA) */
export const ADVTERM_DIR = process.env.ADVTERM_DIR || join(homedir(), '.advanced-terminal')
/** спул-директория: hook-скрипт кладёт сюда файлы-события, main их читает и удаляет */
export const EVENTS_DIR = join(ADVTERM_DIR, 'events')
export const HOOK_SCRIPT = join(ADVTERM_DIR, 'hook.sh')
/** команда advterm-ask для сессий Claude (вопросы владельцу); папка добавляется в PATH терминалов */
export const BIN_DIR = join(ADVTERM_DIR, 'bin')
export const ASK_SCRIPT = join(BIN_DIR, 'advterm-ask')

export const CLAUDE_DIR = join(homedir(), '.claude')
export const CLAUDE_SETTINGS = join(CLAUDE_DIR, 'settings.json')
export const CLAUDE_PROJECTS_DIR = join(CLAUDE_DIR, 'projects')
