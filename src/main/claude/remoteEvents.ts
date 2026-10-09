// Приёмник событий hooks с удалённых (ssh) терминалов. Слушает только 127.0.0.1;
// на удалённом хосте порт пробрасывается обратным туннелем `ssh -R`, и hook.sh
// там делает POST /<termId>/<event> с JSON хука в теле. Событие кладётся в тот же
// спул EVENTS_DIR, что и локальные — дальше его обрабатывает обычный watcher.
import { createServer } from 'http'
import { mkdirSync } from 'fs'
import { rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { EVENTS_DIR } from '../paths'

let port = 0

/** локальный порт приёмника; 0 — не запущен */
export function getRemoteEventsPort(): number {
  return port
}

/** детерминированный порт на удалённом хосте для обратного туннеля терминала */
export function remotePortFor(termId: string): number {
  let h = 0
  for (const ch of termId) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return 47000 + (h % 1000)
}

export function startRemoteEventsServer(): Promise<void> {
  mkdirSync(EVENTS_DIR, { recursive: true })
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const m = /^\/([0-9a-f-]{36})\/(\w+)$/.exec(req.url ?? '')
      if (req.method !== 'POST' || !m) {
        res.statusCode = 404
        res.end()
        return
      }
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        // то же имя, что пишет hook.sh локально: <ts>_<rand>__<termId>__<event>.json
        const name = `${Math.floor(Date.now() / 1000)}_${Math.floor(Math.random() * 32768)}__${m[1]}__${m[2]}.json`
        const f = join(EVENTS_DIR, name)
        writeFile(f + '.tmp', Buffer.concat(chunks))
          .then(() => rename(f + '.tmp', f))
          .catch(() => {})
        res.end()
      })
    })
    srv.on('error', () => resolve()) // без приёмника статусы ssh-терминалов просто не обновятся
    srv.listen(0, '127.0.0.1', () => {
      const a = srv.address()
      if (a && typeof a === 'object') port = a.port
      resolve()
    })
  })
}
