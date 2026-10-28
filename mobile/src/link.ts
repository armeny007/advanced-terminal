// Соединение с релеем в роли client: шифрованные кадры, автопереподключение, подписка на экран.
import * as SecureStore from 'expo-secure-store'
import type { ClientMsg, HostMsg } from '../../src/shared/mobile-protocol'
import { deriveKeys, fromB64Url, open, seal } from './crypto'
import type { Keys } from './crypto'
import { applyHostMsg, getState, setState } from './store'

const PAIR_KEY = 'advterm.pairing'

let ws: WebSocket | null = null
let keys: Keys | null = null
let relayUrl = ''
let retryMs = 1000
let timer: ReturnType<typeof setTimeout> | null = null
let subscribed: string | null = null

/** Разбор кода сопряжения advterm://pair?relay=…&key=… (или deep link Expo …/--/pair?…) */
export function parsePairing(code: string): { relay: string; secret: Uint8Array } | null {
  const m = /(?:^advterm:\/\/pair|\/--\/pair)\?(.*)$/.exec(code.trim())
  if (!m) return null
  const params: Record<string, string> = {}
  for (const kv of m[1].split('&')) {
    const i = kv.indexOf('=')
    if (i > 0) params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1))
  }
  if (!params.relay || !params.key) return null
  try {
    const secret = fromB64Url(params.key)
    if (secret.length !== 32) return null
    return { relay: params.relay, secret }
  } catch {
    return null
  }
}

export async function loadPairing(): Promise<void> {
  const code = await SecureStore.getItemAsync(PAIR_KEY)
  if (code && parsePairing(code)) {
    setState({ pairing: code })
    connect(code)
  }
}

export async function pair(code: string): Promise<boolean> {
  if (!parsePairing(code)) return false
  await SecureStore.setItemAsync(PAIR_KEY, code)
  setState({ pairing: code })
  connect(code)
  return true
}

export async function unpair(): Promise<void> {
  await SecureStore.deleteItemAsync(PAIR_KEY)
  disconnect()
  setState({ pairing: null, connected: false, hostOnline: false, folders: [], terminals: [], screens: {}, screenLines: {} })
}

function disconnect(): void {
  if (timer) clearTimeout(timer)
  timer = null
  const s = ws
  ws = null
  s?.close()
}

function connect(code: string): void {
  const p = parsePairing(code)
  if (!p) return
  disconnect()
  keys = deriveKeys(p.secret)
  relayUrl = p.relay.replace(/\/+$/, '')
  retryMs = 1000
  dial()
}

function dial(): void {
  if (!keys) return
  const sock = new WebSocket(`${relayUrl}/?room=${keys.roomId}&role=client`)
  ws = sock
  sock.onopen = () => {
    retryMs = 1000
    setState({ connected: true })
    send({ t: 'hello' })
    if (subscribed) send({ t: 'sub', termId: subscribed })
  }
  sock.onmessage = (e) => {
    const text = String(e.data)
    if (text.startsWith('{')) {
      try {
        const j = JSON.parse(text) as { relay?: string; online?: boolean }
        if (j.relay === 'host') {
          setState({ hostOnline: !!j.online })
          if (j.online) {
            send({ t: 'hello' })
            if (subscribed) send({ t: 'sub', termId: subscribed })
          }
        }
      } catch {
        // мусор
      }
      return
    }
    const plain = keys ? open(keys.encKey, text) : null
    if (plain === null) return
    try {
      applyHostMsg(JSON.parse(plain) as HostMsg)
    } catch {
      // невалидный JSON
    }
  }
  const down = (): void => {
    if (ws !== sock) return
    ws = null
    setState({ connected: false, hostOnline: false })
    if (!getState().pairing) return
    timer = setTimeout(dial, retryMs)
    retryMs = Math.min(retryMs * 2, 30_000)
  }
  sock.onclose = down
  sock.onerror = () => {
    // за error следует close
  }
}

export function send(msg: ClientMsg): void {
  if (ws && ws.readyState === WebSocket.OPEN && keys) ws.send(seal(keys.encKey, JSON.stringify(msg)))
}

/** Следить за экраном терминала (null — перестать) */
export function subscribe(termId: string | null): void {
  subscribed = termId
  send({ t: 'sub', termId })
}
