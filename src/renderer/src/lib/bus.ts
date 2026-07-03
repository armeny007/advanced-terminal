import { Terminal } from '@xterm/xterm'

// Единая шина данных терминалов: ОДНА подписка window.api.onTermData на всё
// приложение раздаёт данные инстансам xterm по id. Данные от pty могут прийти
// раньше, чем смонтируется xterm, поэтому до регистрации инстанса они буферизуются.

interface Entry {
  term: Terminal | null
  buffer: string[]
}

class TermDataBus {
  private entries = new Map<string, Entry>()
  private started = false

  private ensure(id: string): Entry {
    let e = this.entries.get(id)
    if (!e) {
      e = { term: null, buffer: [] }
      this.entries.set(id, e)
    }
    return e
  }

  /** вызывается один раз при старте приложения */
  start(): void {
    if (this.started) return
    this.started = true
    window.api.onTermData((id, data) => {
      const e = this.ensure(id)
      if (e.term) e.term.write(data)
      else {
        // данные до монтирования xterm буферизуем; в окне отдельной папки
        // приходят данные и чужих терминалов — ограничиваем буфер, чтобы не течь
        e.buffer.push(data)
        if (e.buffer.length > 400) e.buffer.splice(0, e.buffer.length - 400)
      }
    })
  }

  register(id: string, term: Terminal): void {
    const e = this.ensure(id)
    e.term = term
    if (e.buffer.length) {
      for (const chunk of e.buffer) term.write(chunk)
      e.buffer = []
    }
  }

  /** инстанс уничтожен (терминал закрыт) */
  dispose(id: string): void {
    this.entries.delete(id)
  }

  get(id: string): Terminal | null {
    return this.entries.get(id)?.term ?? null
  }

  focus(id: string): void {
    this.entries.get(id)?.term?.focus()
  }

  /** последние `count` непустых строк из буфера — для дашборда */
  lastLines(id: string, count: number): string[] {
    const term = this.get(id)
    if (!term) return []
    const buf = term.buffer.active
    const out: string[] = []
    for (let i = buf.length - 1; i >= 0 && out.length < count; i--) {
      const line = buf.getLine(i)?.translateToString(true).replace(/\s+$/, '') ?? ''
      if (line.trim()) out.unshift(line)
    }
    return out
  }
}

export const bus = new TermDataBus()
