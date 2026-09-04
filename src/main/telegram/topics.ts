// Синхронизация тем группы Telegram с вкладками: тема = вкладка.
// Новая вкладка → создаём тему; переименование → правим; удаление → закрываем тему.
import type { Telegraf } from 'telegraf'
import type { Store } from '../contracts'

/** Создать недостающие топики и переименовать изменившиеся; вернуть актуальную карту. */
export async function ensureTopics(bot: Telegraf, store: Store): Promise<void> {
  const st = store.getState()
  const groupId = st.telegram.groupChatId
  if (groupId == null) return

  const topics: Record<string, number> = { ...st.telegram.folderTopics }
  const validIds = new Set(st.folders.map((f) => f.id))
  let changed = false

  // вкладку удалили → закрываем её тему (история остаётся, новых сообщений нет)
  for (const fid of Object.keys(topics)) {
    if (!validIds.has(fid)) {
      try {
        await bot.telegram.closeForumTopic(groupId, topics[fid])
      } catch {
        // тема уже закрыта/удалена или нет прав «Управление темами» — не критично
      }
      delete topics[fid]
      changed = true
    }
  }

  for (const f of st.folders) {
    const name = `${f.icon ? f.icon + ' ' : ''}${f.name}`.slice(0, 128)
    const existing = topics[f.id]
    if (existing == null) {
      try {
        const t = await bot.telegram.createForumTopic(groupId, name)
        topics[f.id] = t.message_thread_id
        changed = true
      } catch (e) {
        console.error('telegram: createForumTopic не удалось', e)
      }
    } else {
      try {
        await bot.telegram.editForumTopic(groupId, existing, { name })
      } catch {
        // имя не менялось или нет прав «Manage Topics» — не критично
      }
    }
  }

  if (changed) store.setTelegram({ folderTopics: topics })
}

/** Подписка на изменение состава/имён вкладок (с дебаунсом). */
export function watchTopics(bot: Telegraf, store: Store): void {
  const signature = (): string => {
    const st = store.getState()
    if (st.telegram.groupChatId == null) return 'off'
    return st.folders.map((f) => `${f.id}:${f.name}:${f.icon ?? ''}`).join('|')
  }

  let lastSig = signature()
  let timer: NodeJS.Timeout | null = null

  store.onChange(() => {
    const sig = signature()
    if (sig === lastSig) return
    lastSig = sig
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void ensureTopics(bot, store), 1500)
  })
}
