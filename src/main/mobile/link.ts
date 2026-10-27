// Соединение с релеем в роли host: шифрованные кадры в обе стороны, автопереподключение.
import WebSocket from 'ws'
import type { ClientMsg, HostMsg } from '../../shared/mobile-protocol'
import { open, seal } from './crypto'
import type { Keys } from './crypto'

export interface LinkOpts {
  relayUrl: string
  keys: Keys
  onMessage: (msg: ClientMsg) => void
  /** connected — есть соединение с релеем; clients — сколько телефонов в комнате */
  onStatus: (connected: boolean, clients: number, error: string | null) => void
}

export interface Link {
  send(msg: HostMsg): void
  clients(): number
  close(): void
}

export function createLink(opts: LinkOpts): Link {
  let ws: WebSocket | null = null
  let closed = false
  let clients = 0
  let retryMs = 1000
  let timer: NodeJS.Timeout | null = null

  function connect(): void {
    if (closed) return
    const url = `${opts.relayUrl.replace(/\/+$/, '')}/?room=${opts.keys.roomId}&role=host`
    const sock = new WebSocket(url)
    ws = sock
    sock.on('open', () => {
      retryMs = 1000
      opts.onStatus(true, clients, null)
    })
    sock.on('message', (data) => {
      const text = data.toString()
      if (process.env.ADVTERM_MOBILE_DEBUG) console.log('[mobile] <-', text.slice(0, 60))
      if (text.startsWith('{')) {
        // служебное сообщение релея (plaintext)
        try {
          const j = JSON.parse(text) as { relay?: string; clients?: number }
          if (j.relay === 'peer' && typeof j.clients === 'number') {
            clients = j.clients
            opts.onStatus(true, clients, null)
          }
        } catch {
          // мусор — игнорируем
        }
        return
      }
      const plain = open(opts.keys.encKey, text)
      if (process.env.ADVTERM_MOBILE_DEBUG) console.log('[mobile] open ->', plain)
      if (plain === null) return // чужой ключ / битый кадр
      try {
        opts.onMessage(JSON.parse(plain) as ClientMsg)
      } catch {
        // невалидный JSON — игнорируем
      }
    })
    const onDown = (err?: Error): void => {
      if (ws !== sock) return
      ws = null
      clients = 0
      opts.onStatus(false, 0, err ? err.message : null)
      if (closed) return
      timer = setTimeout(connect, retryMs)
      retryMs = Math.min(retryMs * 2, 30_000)
    }
    sock.on('close', () => onDown())
    sock.on('error', (e) => {
      // за error всегда следует close — статус/ретрай там; тут только запоминаем текст
      opts.onStatus(false, 0, e.message)
    })
  }

  connect()
  return {
    send(msg) {
      if (process.env.ADVTERM_MOBILE_DEBUG) console.log('[mobile] ->', msg.t, ws?.readyState)
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(seal(opts.keys.encKey, JSON.stringify(msg)))
    },
    clients: () => clients,
    close() {
      closed = true
      if (timer) clearTimeout(timer)
      ws?.close()
      ws = null
    }
  }
}
