// Зеркало экрана терминала для телефона: headless xterm разбирает тот же поток, что видит
// пользователь, а мы отдаём текст строк буфера (без ANSI). Так на телефоне видно TUI Claude
// (меню, вопросы) ровно как на экране, а не «сырой хвост» с мусором.
import { Terminal } from '@xterm/headless'

/** сколько строк над видимым экраном отдаём (прокрутка назад на телефоне) */
const EXTRA_ROWS = 60

export class ScreenMirror {
  private term: Terminal

  constructor(cols: number, rows: number) {
    this.term = new Terminal({ cols, rows, scrollback: 500, allowProposedApi: true })
  }

  resize(cols: number, rows: number): void {
    if (this.term.cols !== cols || this.term.rows !== rows) this.term.resize(cols, rows)
  }

  write(data: string, cb?: () => void): void {
    this.term.write(data, cb)
  }

  /** строки буфера: последние rows + EXTRA_ROWS, без пустого хвоста */
  snapshot(): string {
    const buf = this.term.buffer.active
    const start = Math.max(0, buf.length - this.term.rows - EXTRA_ROWS)
    const lines: string[] = []
    for (let i = start; i < buf.length; i++) {
      lines.push(buf.getLine(i)?.translateToString(true) ?? '')
    }
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop()
    return lines.join('\n')
  }

  dispose(): void {
    this.term.dispose()
  }
}
