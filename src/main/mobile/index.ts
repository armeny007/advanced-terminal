// Мобильное приложение: связь с телефоном через релей. Телефон получает состояние
// (вкладки/терминалы/статусы), живой экран выбранного терминала и пуши «Claude ждёт»;
// шлёт промпты, клавиши и команды запуска Claude. Действия — те же, что у Telegram-бота.
import { app } from 'electron'
import type { IpcMain } from 'electron'
import { IPC } from '../../shared/types'
import type { MobileRuntimeState, MobileSettings } from '../../shared/types'
import type { ClientMsg, HostMsg, MobileTerm } from '../../shared/mobile-protocol'
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

  // --- зеркало экрана подписанного терминала (одно: телефон смотрит один терминал) ---
  let mirror: { termId: string; m: ScreenMirror; last: string; timer: NodeJS.Timeout | null } | null = null
  const dropMirror = (): void => {
    if (!mirror) return
    if (mirror.timer) clearTimeout(mirror.timer)
    mirror.m.dispose()
    mirror = null
  }
  const scheduleScreen = (): void => {
    if (!mirror || mirror.timer) return
    mirror.timer = setTimeout(() => {
      if (!mirror) return
      mirror.timer = null
      const { text, lines } = mirror.m.snapshot()
      // сравниваем со стилями: перемещение выделения в меню меняет только цвет, не текст
      const key = JSON.stringify(lines)
      if (key === mirror.last) return
      mirror.last = key
      link?.send({ t: 'screen', termId: mirror.termId, text, lines })
    }, SCREEN_THROTTLE)
  }
  const subscribe = (termId: string | null): void => {
    dropMirror()
    if (!termId || !store.getTerminal(termId)) return
    const { cols, rows } = pty.getSize(termId)
    const m = new ScreenMirror(cols, rows)
    mirror = { termId, m, last: '', timer: null }
    // накопленный хвост — чтобы экран появился сразу, не дожидаясь нового вывода
    m.write(pty.getRecentOutput(termId), () => {
      if (mirror?.m !== m) return
      mirror.last = ''
      scheduleScreen()
      // в хвосте буфера только последние кадры TUI (Claude рисует поверх, абсолютными позициями),
      // верх экрана в зеркале пустой. Дёргаем размер pty — TUI перерисовывает весь экран целиком
      pty.resize(termId, cols - 1, rows)
      pty.resize(termId, cols, rows)
    })
  }
  pty.onOutput((id, data) => {
    if (!mirror || mirror.termId !== id) return
    const { cols, rows } = pty.getSize(id)
    mirror.m.resize(cols, rows)
    mirror.m.write(data, scheduleScreen)
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
    dropMirror()
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
        if (n === 0) dropMirror() // телефон отключился — экран больше никому не нужен
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
