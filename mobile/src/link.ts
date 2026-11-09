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
let lastRxAt = 0
let beat: ReturnType<typeof setInterval> | null = null

/** как часто подтверждаем живость прикладным hello */
const BEAT_MS = 20_000
/** молчание дольше этого = сокет мёртв (релей пингует каждые 30с, но RN не отдаёт ping в JS) */
const DEAD_MS = 45_000

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
  setState({ pairing: null, connected: false, hostOnline: false, folders: [], terminals: [], screens: {}, screenLines: {}, screenHistory: {}, questions: [] })
}

function stopBeat(): void {
  if (beat) clearInterval(beat)
  beat = null
}

function startBeat(): void {
  stopBeat()
  beat = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (lastRxAt && Date.now() - lastRxAt > DEAD_MS) redial()
    else send({ t: 'hello' })
  }, BEAT_MS)
}

function disconnect(): void {
  stopBeat()
  if (timer) clearTimeout(timer)
  timer = null
  const s = ws
  ws = null
  s?.close()
}

/** Переподключиться сейчас же, не теряя сопряжения и подписки */
function redial(): void {
  if (!keys) return
  stopBeat()
  if (timer) clearTimeout(timer)
  timer = null
  const s = ws
  ws = null
  s?.close()
  retryMs = 1000
  dial()
}

/**
 * Приложение вернулось на экран. iOS в фоне усыпляет рантайм и рвёт TCP, причём onclose
 * может не прийти — тогда ws остаётся в состоянии OPEN, таймер переподключения не заведён,
 * и клиент висит мёртвым. Поэтому при каждом возврате убеждаемся в живости явно.
 */
export function ensureLive(): void {
  if (!keys) return
  if (!ws || ws.readyState !== WebSocket.OPEN) redial()
  else if (lastRxAt && Date.now() - lastRxAt > BEAT_MS) redial()
  else send({ t: 'hello' })
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
    lastRxAt = Date.now()
    startBeat()
    setState({ connected: true })
    send({ t: 'hello' })
    if (subscribed) send({ t: 'sub', termId: subscribed })
  }
  sock.onmessage = (e) => {
    lastRxAt = Date.now()
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
    stopBeat()
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
