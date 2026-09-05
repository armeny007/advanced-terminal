// Telegraf-слой: команды, навигация по callback-кнопкам, режим ответа.
// Полное управление доступно только спаренным аккаунтам (allowedChatIds).
import { Telegraf } from 'telegraf'
import type { Context } from 'telegraf'
import type { ActionDeps } from './actions'
import * as A from './actions'
import { consumePairingCode } from './pairing'
import { escapeHtml } from './output'
import { dashboardView, folderView, statusSummary, terminalView } from './views'

const HELP = [
  'Advanced Terminal — управление сессиями Claude Code.',
  '',
  'Команды:',
  '/menu — вкладки и терминалы (в теме группы — сессии этой вкладки)',
  '/status — что ждёт ввода',
  '/help — эта справка',
  '',
  'Кнопки на карточке сессии:',
  '✍️ Ответить — следующее сообщение уйдёт в сессию как есть: промпт, команда Claude Code (/model, /usage, /compact…) или shell через «! команда»',
  '✅ Да — Enter (подтвердить / выбрать подсвеченный пункт меню)',
  '❌ Нет — Esc (отмена)',
  '🆕 Новая — новая сессия Claude в этом терминале',
  '⏸ Продолжить — claude --continue (продолжить последнюю)',
  '♻️ Перезапуск — перезапустить shell терминала',
  '▶️ Возобновить привязанную — claude --resume привязанной сессии',
  '📄 Вывод — последние сообщения сессии (из транскрипта); без сессии — хвост терминала',
  '⬆️ ⬇️ — стрелки в интерактивном меню Claude (/model, /resume…); после нажатия придёт экран',
  '🖥 Экран — что сейчас на экране терминала: видно меню и подсказки (в отличие от «Вывода»)',
  '⬅️ Назад — к списку терминалов вкладки'
].join('\n')

type Keyboard = ReturnType<typeof dashboardView>['keyboard']

function msgText(ctx: Context): string {
  const m = ctx.message
  return m && 'text' in m && typeof m.text === 'string' ? m.text : ''
}

async function editOrReply(ctx: Context, text: string, keyboard: Keyboard): Promise<void> {
  try {
    await ctx.editMessageText(text, keyboard)
  } catch {
    // сообщение нельзя редактировать (не то, слишком старое) — шлём новое
    await ctx.reply(text, keyboard)
  }
}

export function createBot(token: string, deps: ActionDeps): Telegraf {
  const bot = new Telegraf(token)
  const { store } = deps
  const replyTargets = new Map<number, string>() // userId -> termId (режим ответа)

  const isAllowed = (uid?: number): boolean =>
    uid != null && store.getState().telegram.allowedChatIds.includes(uid)

  // message_thread_id входящего сообщения/колбэка (тема форум-группы)
  const threadOf = (ctx: Context): number | undefined => {
    const m = ctx.message ?? ctx.callbackQuery?.message
    return m && 'message_thread_id' in m ? (m.message_thread_id as number | undefined) : undefined
  }
  // какой папке соответствует тема (тема = вкладка)
  const folderForThread = (threadId?: number): string | undefined => {
    if (threadId == null) return undefined
    const { folderTopics } = store.getState().telegram
    return Object.keys(folderTopics).find((fid) => folderTopics[fid] === threadId)
  }
  // человекочитаемая метка терминала-цели: «имя» (папка) — чтобы было видно, куда уйдёт текст
  const termLabel = (termId: string): string => {
    const t = store.getTerminal(termId)
    if (!t) return 'сессию'
    const folder = store.getState().folders.find((f) => f.id === t.folderId)
    return folder ? `«${t.name}» (${folder.name})` : `«${t.name}»`
  }

  // авторизация: всех, кроме спаренных, пускаем только на /start (для сопряжения)
  bot.use(async (ctx, next) => {
    if (isAllowed(ctx.from?.id)) return next()
    const text = msgText(ctx)
    if (text.startsWith('/start')) return next()
    // на прочие КОМАНДЫ от непривязанного отвечаем подсказкой (иначе «ничего не происходит»);
    // на обычный текст молчим, чтобы не спамить
    if (text.startsWith('/')) {
      try {
        await ctx.reply(
          '🔒 Аккаунт не привязан. Откройте бота в личном чате и отправьте /start <код> — код есть в настройках приложения (кнопка Telegram → «Сгенерировать код»).'
        )
      } catch {
        // нет прав ответить в этот чат — не критично
      }
    }
  })

  // Режим ответа. Стоит ДО обработчиков команд бота: пока цель армирована, следующее
  // сообщение уходит в сессию ДОСЛОВНО — в т.ч. команды Claude Code (/model, /usage,
  // /compact, /status…) и shell через `! cmd`. Иначе /status, /help, /menu перехватил бы сам бот.
  bot.use(async (ctx, next) => {
    const uid = ctx.from?.id
    const text = msgText(ctx)
    if (uid == null || !text) return next()
    const target = replyTargets.get(uid)
    if (!target) return next()
    replyTargets.delete(uid)
    if (!store.getTerminal(target)) {
      await ctx.reply('Терминал уже не существует.')
      return
    }
    // в группах Telegram дописывает к /команде суффикс @ИмяБота — Claude его не поймёт
    const clean = text.replace(/^(\/\w+)@\w+/, '$1')
    const label = termLabel(target)
    A.sendPrompt(deps, target, clean)
    await ctx.reply(`📨 Отправлено в ${label}.`)
  })

  async function handleStart(ctx: Context): Promise<void> {
    const uid = ctx.from?.id
    if (isAllowed(uid)) return showDashboard(ctx)
    // \s в split ловит и обычный, и неразрывный пробел (\xa0) между /start и кодом
    const payload = msgText(ctx).split(/\s+/).slice(1).join(' ')
    const ok = payload ? consumePairingCode(payload) : false // расходующий вызов — только один раз
    if (uid != null && ok) {
      const ids = store.getState().telegram.allowedChatIds
      store.setTelegram({ allowedChatIds: [...new Set([...ids, uid])] })
      await ctx.reply('✅ Аккаунт привязан.')
      return showDashboard(ctx)
    }
    await ctx.reply('🔒 Доступ закрыт. Отправьте код сопряжения из настроек приложения:\n/start <код>')
  }

  async function handleBindgroup(ctx: Context): Promise<void> {
    if (ctx.chat?.type !== 'supergroup') {
      await ctx.reply('Команду нужно вызвать в группе с включёнными темами (Topics).')
      return
    }
    store.setTelegram({ groupChatId: ctx.chat.id, folderTopics: {} })
    await ctx.reply('✅ Группа привязана. Топики для вкладок появятся автоматически.')
  }

  // Основные обработчики команд (работают, когда telegraf распознал команду).
  bot.start(handleStart)
  bot.command('menu', showMenu)
  bot.command('status', async (ctx) => {
    await ctx.reply(statusSummary(store))
  })
  bot.command('help', async (ctx) => {
    await ctx.reply(HELP)
  })
  bot.command('bindgroup', handleBindgroup)

  bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery && 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : ''
    try {
      await route(ctx, data)
    } catch {
      // навигация не должна ронять бота
    }
    try {
      await ctx.answerCbQuery()
    } catch {
      // запрос мог быть уже отвечен/устарел
    }
  })

  bot.on('text', async (ctx) => {
    const text = msgText(ctx)
    // Фолбэк: telegraf иногда НЕ распознаёт команду (напр. неразрывный пробел \xa0
    // между командой и аргументом, который вставляет iOS). Диспетчеризуем сами.
    if (/^\/start(\s|$)/.test(text)) return handleStart(ctx)
    if (/^\/menu(\s|$)/.test(text)) return showMenu(ctx)
    if (/^\/status(\s|$)/.test(text)) {
      await ctx.reply(statusSummary(store))
      return
    }
    if (/^\/help(\s|$)/.test(text)) {
      await ctx.reply(HELP)
      return
    }
    if (/^\/bindgroup(\s|$)/.test(text)) return handleBindgroup(ctx)
    // прочий текст без армированной цели игнорируем (режим ответа — в middleware выше)
  })

  bot.catch((err) => console.error('telegram bot error:', err))

  async function showDashboard(ctx: Context): Promise<void> {
    const v = dashboardView(store)
    await ctx.reply(v.text, v.keyboard)
  }

  // /menu: в теме форум-группы показываем сессии ИМЕННО этой вкладки, иначе — весь дашборд
  async function showMenu(ctx: Context): Promise<void> {
    const fid = folderForThread(threadOf(ctx))
    const v = fid ? folderView(store, fid) : dashboardView(store)
    await ctx.reply(v.text, v.keyboard)
  }

  async function route(ctx: Context, data: string): Promise<void> {
    if (!data || data === 'root') {
      const v = dashboardView(store)
      return editOrReply(ctx, v.text, v.keyboard)
    }
    if (data.startsWith('f:')) {
      const v = folderView(store, data.slice(2))
      return editOrReply(ctx, v.text, v.keyboard)
    }
    if (data.startsWith('t:')) {
      const v = terminalView(store, data.slice(2))
      if (!v) {
        await ctx.answerCbQuery('Терминал не найден')
        return
      }
      return editOrReply(ctx, v.text, v.keyboard)
    }
    if (data.startsWith('a:')) {
      const [, op, id] = data.split(':')
      await handleAction(ctx, op, id)
    }
  }

  async function refreshCard(ctx: Context, termId: string): Promise<void> {
    // дать хуку/статусу немного времени обновиться
    await new Promise((r) => setTimeout(r, 300))
    const v = terminalView(store, termId)
    if (v) await editOrReply(ctx, v.text, v.keyboard)
  }

  async function handleAction(ctx: Context, op: string, id: string): Promise<void> {
    switch (op) {
      case 'reply':
        if (ctx.from?.id != null) replyTargets.set(ctx.from.id, id)
        await ctx.answerCbQuery('Пришлите текст ответа сообщением')
        await ctx.reply(
          `✍️ Следующее сообщение уйдёт в ${termLabel(id)} как есть — промпт, команда Claude (/model, /usage…) или «! shell».`
        )
        return
      case 'yes':
        A.quickAnswer(deps, id, true)
        await ctx.answerCbQuery('Enter')
        return
      case 'no':
        A.quickAnswer(deps, id, false)
        await ctx.answerCbQuery('Esc')
        return
      case 'new':
        A.newSession(deps, id)
        await refreshCard(ctx, id)
        return
      case 'cont':
        A.continueSession(deps, id)
        await refreshCard(ctx, id)
        return
      case 'resume':
        if (!A.resumeSession(deps, id)) {
          await ctx.answerCbQuery('Нет привязанной сессии')
          return
        }
        await refreshCard(ctx, id)
        return
      case 'restart':
        A.restart(deps, id)
        await refreshCard(ctx, id)
        return
      case 'addterm': {
        const newId = A.createTerminal(deps, id)
        await ctx.answerCbQuery('Терминал создан')
        const v = terminalView(store, newId)
        if (v) await editOrReply(ctx, v.text, v.keyboard)
        return
      }
      case 'up':
      case 'down':
        A.arrow(deps, id, op === 'up' ? 'up' : 'down')
        await ctx.answerCbQuery(op === 'up' ? '↑' : '↓')
        // дать TUI перерисоваться — и показать, куда встал курсор
        await new Promise((r) => setTimeout(r, 300))
        await ctx.reply(`<pre>${escapeHtml(A.screenTail(deps, id))}</pre>`, { parse_mode: 'HTML' })
        return
      case 'screen':
        await ctx.reply(`<pre>${escapeHtml(A.screenTail(deps, id))}</pre>`, { parse_mode: 'HTML' })
        return
      case 'out': {
        const { text, mono } = await A.outputTail(deps, id)
        // транскрипт — обычным текстом (читаемо на телефоне), сырой хвост — моноширинно
        if (mono) await ctx.reply(`<pre>${escapeHtml(text)}</pre>`, { parse_mode: 'HTML' })
        else await ctx.reply(text)
        return
      }
      default:
        return
    }
  }

  return bot
}
