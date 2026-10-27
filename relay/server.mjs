// Релей Advanced Terminal: «тупой» WebSocket-хаб между приложением на Mac (host)
// и телефоном (client). Комната = roomId (выводится из секрета сопряжения, релей
// секрета не знает). Всё содержимое сообщений зашифровано на концах (ChaCha20-Poly1305),
// релей только пересылает: host → всем client'ам, client → host.
// Служебные сообщения релея — plaintext JSON с полем "relay".
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT || 8787)
const MAX_MSG = 512 * 1024 // защита от мусора; экран терминала — десятки КБ

/** roomId -> { host: ws|null, clients: Set<ws> } */
const rooms = new Map()

function room(id) {
  let r = rooms.get(id)
  if (!r) {
    r = { host: null, clients: new Set() }
    rooms.set(id, r)
  }
  return r
}

function sendJson(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj))
}

const wss = new WebSocketServer({ port: PORT, maxPayload: MAX_MSG })

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', 'ws://x')
  const roomId = url.searchParams.get('room') ?? ''
  const role = url.searchParams.get('role')
  if (!/^[0-9a-f]{32,64}$/.test(roomId) || (role !== 'host' && role !== 'client')) {
    ws.close(4000, 'bad room/role')
    return
  }
  const r = room(roomId)
  ws.isAlive = true
  ws.on('pong', () => (ws.isAlive = true))

  if (role === 'host') {
    // новый host вытесняет старый (перезапуск приложения)
    if (r.host && r.host !== ws) r.host.close(4001, 'replaced')
    r.host = ws
    sendJson(ws, { relay: 'peer', clients: r.clients.size })
    for (const c of r.clients) sendJson(c, { relay: 'host', online: true })
  } else {
    r.clients.add(ws)
    sendJson(ws, { relay: 'host', online: r.host != null })
    sendJson(r.host, { relay: 'peer', clients: r.clients.size })
  }

  ws.on('message', (data, isBinary) => {
    const payload = isBinary ? data : data.toString()
    if (role === 'host') {
      for (const c of r.clients) if (c.readyState === c.OPEN) c.send(payload)
    } else if (r.host && r.host.readyState === r.host.OPEN) {
      r.host.send(payload)
    }
  })

  ws.on('close', () => {
    if (role === 'host') {
      if (r.host === ws) {
        r.host = null
        for (const c of r.clients) sendJson(c, { relay: 'host', online: false })
      }
    } else {
      r.clients.delete(ws)
      sendJson(r.host, { relay: 'peer', clients: r.clients.size })
    }
    if (!r.host && r.clients.size === 0) rooms.delete(roomId)
  })
  ws.on('error', () => {})
})

// пинг каждые 30с: мёртвые соединения (телефон ушёл в сон) закрываем
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, 30_000)

console.log(`advterm relay listening on :${PORT}`)
