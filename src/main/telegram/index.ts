// Точка входа Telegram-бота: контроллер запуска, IPC настроек, пуши, топики.
import { app } from 'electron'
import type { IpcMain } from 'electron'
import type { Telegraf } from 'telegraf'
import { IPC } from '../../shared/types'
import type { TelegramRuntimeState, TelegramSettings } from '../../shared/types'
import type { PtyManager, Store } from '../contracts'
import { setAttentionHook } from '../attention'
import type { AttentionEvent } from '../attention'
import { send } from '../runtime'
import { createBot } from './bot'
import { generatePairingCode } from './pairing'
import { clearToken, hasToken, loadToken, saveToken } from './secret'
import { ensureTopics, watchTopics } from './topics'
import { attentionText, terminalKeyboard } from './views'

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms))
  ])
}

export function initTelegram(ipcMain: IpcMain, store: Store, pty: PtyManager): void {
  const deps = { store, pty }
  let bot: Telegraf | null = null
  let running = false
  let starting = false
  let lastError: string | null = null

  const runtimeState = (): TelegramRuntimeState => {
    const tg = store.getState().telegram
    return {
      enabled: tg.enabled,
      hasToken: hasToken(),
      running,
      starting,
      allowedChatIds: tg.allowedChatIds,
      groupChatId: tg.groupChatId,
      showOutputTail: tg.showOutputTail,
      error: lastError
    }
  }
  const broadcast = (): void => send(IPC.telegramRuntime, runtimeState())

  // поколение: каждый stop() инкрементит, чтобы отменить незавершённые запуски/ретраи
  let generation = 0
  // на самом первом запуске чистим старый «хвост» (сброс pending), чтобы не
  // переобрабатывать накопленные сообщения; на авто-перезапусках НЕ чистим,
  // иначе потеряется только что присланный /start <код>
  let firstLaunch = true

  function stop(): void {
    generation++
    setAttentionHook(null)
    if (bot) {
      try {
        bot.stop()
      } catch {
        // уже остановлен
      }
      bot = null
    }
    running = false
    starting = false
  }

  async function start(): Promise<void> {
    const myGen = ++generation
    const aborted = (): boolean => myGen !== generation
    const token = loadToken()
    if (!token) {
      lastError = 'нет токена'
      running = false
      return
    }
    starting = true
    lastError = null
    broadcast() // спиннер «подключение к Telegram…»
    try {
      const b = createBot(token, deps)
      // валидируем токен и кэшируем инфо, чтобы launch не делал второй getMe
      b.botInfo = await withTimeout(b.telegram.getMe(), 30_000, 'таймаут подключения к Telegram')
      if (aborted()) return void safeStop(b)

      // launch резолвится только при остановке, реджектится при ошибке запуска (409/сеть).
      const dropPending = firstLaunch
      firstLaunch = false
      let launchErr: Error | null = null
      const launched = (dropPending ? b.launch({ dropPendingUpdates: true }) : b.launch()).catch(
        (e: unknown) => {
          launchErr = e instanceof Error ? e : new Error(String(e))
        }
      )
      // если за ~3с launch не отвалился — опрос реально поднялся
      await Promise.race([launched, new Promise((r) => setTimeout(r, 3000))])
      if (aborted()) return void safeStop(b)
      if (launchErr) throw launchErr

      bot = b
      running = true
      lastError = null
      starting = false
      broadcast()
      setAttentionHook((ev) => void pushAttention(ev)) // пуши «Claude ждёт тебя»
      watchTopics(b, store) // топики: тема = вкладка (Фаза 2)
      void ensureTopics(b, store)
      // поздняя смерть опроса (обрыв/конфликт) → отражаем и пробуем перезапустить
      void launched.then(() => {
        if (aborted()) return
        running = false
        bot = null
        lastError = launchErr ? String(launchErr.message) : lastError
        broadcast()
        if (store.getState().telegram.enabled) setTimeout(() => void reconcile(), 5000)
      })
    } catch (e) {
      if (aborted()) return
      lastError = String((e as Error)?.message ?? e)
      running = false
      starting = false
      broadcast()
      // конфликт опроса/таймаут обычно временный — авто-повтор
      if (store.getState().telegram.enabled && /409|conflict|таймаут|timeout/i.test(lastError)) {
        setTimeout(() => void reconcile(), 5000)
      }
    } finally {
      if (!aborted()) starting = false
    }
  }

  function safeStop(b: Telegraf): void {
    try {
      b.stop()
    } catch {
      // уже остановлен
    }
  }

  async function reconcile(): Promise<void> {
    const desired = store.getState().telegram.enabled && hasToken()
    if (desired && !running && !starting) {
      await start()
    } else if (!desired && running) {
      stop()
    }
    broadcast()
  }

  async function pushAttention(ev: AttentionEvent): Promise<void> {
    if (!bot) return
    const term = store.getTerminal(ev.termId)
    if (!term) return
    const text = attentionText(store, ev.termId, ev.status, ev.message, ev.completed)
    if (!text) return
    const kb = terminalKeyboard(store, ev.termId)
    const tg = store.getState().telegram
    for (const chatId of tg.allowedChatIds) {
      try {
        await bot.telegram.sendMessage(chatId, text, kb)
      } catch {
        // пользователь заблокировал бота / чат недоступен
      }
    }
    if (tg.groupChatId != null) {
      const threadId = tg.folderTopics[term.folderId]
      if (threadId != null) {
        try {
          await bot.telegram.sendMessage(tg.groupChatId, text, {
            message_thread_id: threadId,
            reply_markup: kb.reply_markup
          })
        } catch {
          // нет топика/прав
        }
      }
    }
  }

  // --- IPC ---
  // reconcile НЕ ждём: старт бота (валидация токена getMe) может занять секунды,
  // а UI должен ответить сразу. Итог (running/ошибка) прилетит событием telegram:runtime.
  ipcMain.handle(IPC.telegramGetRuntime, () => runtimeState())
  ipcMain.handle(IPC.telegramSetToken, (_e, token: string | null) => {
    if (token && token.trim()) saveToken(token)
    else clearToken()
    stop()
    void reconcile()
    return runtimeState()
  })
  ipcMain.handle(IPC.telegramPatchSettings, (_e, patch: Partial<TelegramSettings>) => {
    store.setTelegram(patch)
    // enabled → reconcile запустит/остановит; allowed/group учитываются на лету
    void reconcile()
    return runtimeState()
  })
  ipcMain.handle(IPC.telegramGenPairing, () => generatePairingCode())

  void reconcile() // старт при запуске приложения, если включено и есть токен
  app.on('before-quit', () => stop())
}
