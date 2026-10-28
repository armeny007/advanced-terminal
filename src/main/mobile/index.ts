// Мобильное приложение: связь с телефоном через релей. Телефон получает состояние
// (вкладки/терминалы/статусы), живой экран выбранного терминала и пуши «Claude ждёт»;
// шлёт промпты, клавиши и команды запуска Claude. Действия — те же, что у Telegram-бота.
import { app } from 'electron'
import type { IpcMain } from 'electron'
import { IPC } from '../../shared/types'
import type { MobileRuntimeState, MobileSettings } from '../../shared/types'
import type { ClientMsg, HostMsg, MobileTerm, ScreenSeg } from '../../shared/mobile-protocol'
import { PAIR_SCHEME } from '../../shared/mobile-protocol'
import type { PtyManager, Store } from '../contracts'
import { addAttentionHook } from '../attention'
import { send } from '../runtime'
import { createSecretStore } from '../secretStore'
import * as A from '../telegram/actions'
import { deriveKeys, fromB64Url, newSecret, toB64Url } from './crypto'
import { createLink } from './link'
import type { Link } from './link'
import { ScreenMirror } from './screen'

const ESC = String.fromCharCode(27)
const KEY_SEQ: Record<string, string> = {
  left: `${ESC}[D`,
  right: `${ESC}[C`,
  tab: '\t',
  'shift-tab': `${ESC}[Z`,
  'ctrl-c': String.fromCharCode(3)
}
/** как часто шлём экран/состояние, мс */
const SCREEN_THROTTLE = 250
/** историю над экраном шлём не чаще, мс — она большая и при стриминге ответа растёт постоянно */
const HISTORY_THROTTLE = 2000
const STATE_THROTTLE = 200

export function initMobile(ipcMain: IpcMain, store: Store, pty: PtyManager): void {
  const deps = { store, pty }
  const secrets = createSecretStore('mobile.pair')
  let link: Link | null = null
  let connected = false
  let clients = 0
  let lastError: string | null = null

  const runtimeState = (): MobileRuntimeState => ({
    enabled: store.getState().mobile.enabled,
    relayUrl: store.getState().mobile.relayUrl,
    hasSecret: secrets.has(),
    connected,
    clients,
    error: lastError
  })
  const broadcast = (): void => send(IPC.mobileRuntime, runtimeState())

  const pairingCode = (): string | null => {
    const s = secrets.load()
    if (!s) return null
    return `${PAIR_SCHEME}?relay=${encodeURIComponent(store.getState().mobile.relayUrl)}&key=${s}`
  }

  // --- состояние для телефона ---
  const toMobileTerm = (t: ReturnType<Store['getState']>['terminals'][number]): MobileTerm => ({
    id: t.id,
    folderId: t.folderId,
    name: t.name,
    status: t.status,
    cwd: t.cwd,
    sshHost: t.sshHost ?? null,
    claudeSessionId: t.claudeSessionId,
    archived: t.archived,
    alive: t.alive
  })
  const stateMsg = (): HostMsg => {
    const s = store.getState()
    return {
      t: 'state',
      folders: s.folders.map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color })),
      terminals: s.terminals.map(toMobileTerm)
    }
  }
  let stateTimer: NodeJS.Timeout | null = null
  const pushState = (): void => {
    if (!link || clients === 0 || stateTimer) return
    stateTimer = setTimeout(() => {
      stateTimer = null
      link?.send(stateMsg())
    }, STATE_THROTTLE)
  }
  store.onChange(pushState)

  // --- зеркала экранов: пока связь включена, headless xterm у каждого терминала с выводом —
  // так копится история прокрутки (телефон листает вверх), а не только последний кадр ---
  const mirrors = new Map<string, { m: ScreenMirror; needsNudge: boolean }>()
  let sub: { termId: string; lastScreen: string; lastHist: string; histAt: number; timer: NodeJS.Timeout | null } | null =
    null
  const dropMirrors = (): void => {
    for (const e of mirrors.values()) e.m.dispose()
    mirrors.clear()
    if (sub?.timer) clearTimeout(sub.timer)
    sub = null
  }
  const ensureMirror = (termId: string, cb?: () => void): { m: ScreenMirror; needsNudge: boolean } => {
    let e = mirrors.get(termId)
    if (e) {
      cb?.()
      return e
    }
    const { cols, rows } = pty.getSize(termId)
    e = { m: new ScreenMirror(cols, rows), needsNudge: true }
    mirrors.set(termId, e)
    // накопленный хвост — чтобы экран появился сразу, не дожидаясь нового вывода
    e.m.write(pty.getRecentOutput(termId), cb)
    return e
  }
  const scheduleScreen = (): void => {
    if (!sub || sub.timer) return
    sub.timer = setTimeout(() => {
      if (!sub) return
      sub.timer = null
      const e = mirrors.get(sub.termId)
      if (!e) return
      const { text, lines } = e.m.snapshot()
      // сравниваем со стилями: перемещение выделения в меню меняет только цвет, не текст
      const key = JSON.stringify(lines)
      let history: ScreenSeg[][] | undefined
      const sinceHist = Date.now() - sub.histAt
      if (sinceHist >= HISTORY_THROTTLE) {
        const h = e.m.history()
        const hk = JSON.stringify(h)
        if (hk !== sub.lastHist) {
          sub.lastHist = hk
          sub.histAt = Date.now()
          history = h
        }
      } else {
        // историю сейчас не смотрели — проверим, когда пройдёт интервал (вывода может больше не быть)
        setTimeout(scheduleScreen, HISTORY_THROTTLE - sinceHist)
      }
      if (key === sub.lastScreen && !history) return
      sub.lastScreen = key
      link?.send({ t: 'screen', termId: sub.termId, text, lines, history })
    }, SCREEN_THROTTLE)
  }
  const subscribe = (termId: string | null): void => {
    if (sub?.timer) clearTimeout(sub.timer)
    sub = null
    if (!termId || !store.getTerminal(termId)) return
    sub = { termId, lastScreen: '', lastHist: '', histAt: 0, timer: null }
    const e = ensureMirror(termId, () => {
      if (sub?.termId !== termId) return
      scheduleScreen()
      if (!e.needsNudge) return
      e.needsNudge = false
      // в хвосте буфера только последние кадры TUI (Claude рисует поверх, абсолютными позициями),
      // верх экрана в зеркале пустой. Дёргаем размер pty — TUI перерисовывает весь экран целиком
      const { cols, rows } = pty.getSize(termId)
      pty.resize(termId, cols - 1, rows)
      pty.resize(termId, cols, rows)
    })
  }
  pty.onOutput((id, data) => {
    if (!link) return
    const { cols, rows } = pty.getSize(id)
    const e = ensureMirror(id)
    e.m.resize(cols, rows)
    e.m.write(data, sub?.termId === id ? scheduleScreen : undefined)
  })
  store.onChange((st) => {
    for (const id of mirrors.keys()) {
      if (!st.terminals.some((t) => t.id === id)) {
        mirrors.get(id)?.m.dispose()
        mirrors.delete(id)
      }
    }
  })

  // --- команды с телефона ---
  function handle(msg: ClientMsg): void {
    switch (msg.t) {
      case 'hello':
        link?.send(stateMsg())
        return
      case 'sub':
        subscribe(msg.termId)
        return
      case 'prompt':
        A.sendPrompt(deps, msg.termId, msg.text)
        return
      case 'key':
        if (msg.key === 'enter' || msg.key === 'esc') A.quickAnswer(deps, msg.termId, msg.key === 'enter')
        else if (msg.key === 'up' || msg.key === 'down') A.arrow(deps, msg.termId, msg.key)
        else pty.writeRaw(msg.termId, KEY_SEQ[msg.key] ?? '')
        return
      case 'claude':
        if (msg.mode === 'new') A.newSession(deps, msg.termId)
        else if (msg.mode === 'continue') A.continueSession(deps, msg.termId)
        else if (msg.mode === 'resume') A.resumeSession(deps, msg.termId)
        else A.restart(deps, msg.termId)
        return
      case 'archive':
        store.updateTerminal(msg.termId, { archived: msg.archived })
        return
      case 'newterm':
        A.createTerminal(deps, msg.folderId)
        return
    }
  }

  addAttentionHook((ev) => {
    link?.send({ t: 'attention', termId: ev.termId, status: ev.status, message: ev.message, completed: ev.completed })
  })

  // --- жизненный цикл соединения ---
  function stop(): void {
    link?.close()
    link = null
    dropMirrors()
    connected = false
    clients = 0
  }
  function reconcile(): void {
    const { enabled, relayUrl } = store.getState().mobile
    const secret = secrets.load()
    stop()
    if (!enabled || !secret || !relayUrl) {
      lastError = enabled && !secret ? 'нет кода сопряжения' : null
      broadcast()
      return
    }
    lastError = null
    link = createLink({
      relayUrl,
      keys: deriveKeys(fromB64Url(secret)),
      onMessage: handle,
      onStatus: (c, n, err) => {
        const hadClients = clients
        connected = c
        clients = n
        if (err) lastError = err
        else if (c) lastError = null
        if (n === 0) subscribe(null) // телефон отключился — экран больше никому не нужен
        else if (hadClients === 0) link?.send(stateMsg()) // первый телефон — сразу состояние
        broadcast()
      }
    })
    broadcast()
  }

  // --- IPC ---
  ipcMain.handle(IPC.mobileGetRuntime, () => runtimeState())
  ipcMain.handle(IPC.mobilePatchSettings, (_e, patch: Partial<MobileSettings>) => {
    store.setMobile(patch)
    reconcile()
    return runtimeState()
  })
  ipcMain.handle(IPC.mobileGetPairing, () => pairingCode())
  ipcMain.handle(IPC.mobileGenPairing, () => {
    secrets.save(toB64Url(newSecret()))
    store.setMobile({ enabled: true }) // новый код — значит, связь нужна
    reconcile()
    return pairingCode()
  })

  reconcile()
  app.on('before-quit', () => stop())
}
