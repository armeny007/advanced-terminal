// Зеркало экрана терминала для телефона: headless xterm разбирает тот же поток, что видит
// пользователь, а мы отдаём строки буфера — текстом и сегментами со стилями. Так на телефоне видно
// TUI Claude (меню, вопросы) ровно как на экране, включая выделенный пункт (он только цветом).
import { Terminal } from '@xterm/headless'
import type { IBufferCell, IBufferLine } from '@xterm/headless'
import type { ScreenSeg } from '../../shared/mobile-protocol'

/** сколько строк истории (над видимым экраном) отдаём телефону */
const HISTORY_ROWS = 150

/** 16 базовых цветов — как THEME в TerminalCard (Catppuccin Mocha) */
const ANSI16 = [
  '#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de',
  '#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8'
]

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0')

/** цвет палитры 0..255 → '#rrggbb' (16..231 — куб 6×6×6, 232..255 — серые) */
function paletteColor(i: number): string {
  if (i < 16) return ANSI16[i]
  if (i < 232) {
    const v = [Math.floor((i - 16) / 36), Math.floor((i - 16) / 6) % 6, (i - 16) % 6].map((c) => (c ? c * 40 + 55 : 0))
    return hex((v[0] << 16) | (v[1] << 8) | v[2])
  }
  const g = (i - 232) * 10 + 8
  return hex((g << 16) | (g << 8) | g)
}

function fgOf(c: IBufferCell): string | undefined {
  if (c.isFgRGB()) return hex(c.getFgColor())
  if (c.isFgPalette()) return paletteColor(c.getFgColor())
  return undefined
}

function bgOf(c: IBufferCell): string | undefined {
  if (c.isBgRGB()) return hex(c.getBgColor())
  if (c.isBgPalette()) return paletteColor(c.getBgColor())
  return undefined
}

/** строка буфера → сегменты одинакового стиля (хвостовые пробелы без фона отброшены) */
function lineSegs(line: IBufferLine, cell: IBufferCell): ScreenSeg[] {
  const segs: ScreenSeg[] = []
  for (let x = 0; x < line.length; x++) {
    line.getCell(x, cell)
    if (cell.getWidth() === 0) continue // правая половина широкого символа
    const seg: ScreenSeg = { s: cell.getChars() || ' ' }
    const fg = fgOf(cell)
    const bg = bgOf(cell)
    if (fg) seg.fg = fg
    if (bg) seg.bg = bg
    if (cell.isBold()) seg.b = 1
    if (cell.isDim()) seg.d = 1
    if (cell.isInverse()) seg.i = 1
    const last = segs[segs.length - 1]
    if (last && last.fg === seg.fg && last.bg === seg.bg && last.b === seg.b && last.d === seg.d && last.i === seg.i) {
      last.s += seg.s
    } else segs.push(seg)
  }
  const last = segs[segs.length - 1]
  if (last && !last.bg && !last.i) {
    last.s = last.s.trimEnd()
    if (!last.s) segs.pop()
  }
  return segs
}

export class ScreenMirror {
  private term: Terminal

  constructor(cols: number, rows: number) {
    this.term = new Terminal({ cols, rows, scrollback: 2000, allowProposedApi: true })
  }

  resize(cols: number, rows: number): void {
    if (this.term.cols !== cols || this.term.rows !== rows) this.term.resize(cols, rows)
  }

  write(data: string, cb?: () => void): void {
    this.term.write(data, cb)
  }

  /** видимый экран (последние rows строк буфера), без пустого хвоста */
  snapshot(): { text: string; lines: ScreenSeg[][] } {
    const buf = this.term.buffer.active
    const start = Math.max(0, buf.length - this.term.rows)
    const cell = buf.getNullCell()
    const text: string[] = []
    const lines: ScreenSeg[][] = []
    for (let i = start; i < buf.length; i++) {
      const line = buf.getLine(i)
      text.push(line?.translateToString(true) ?? '')
      lines.push(line ? lineSegs(line, cell) : [])
    }
    while (text.length && text[text.length - 1].trim() === '' && lines[lines.length - 1].length === 0) {
      text.pop()
      lines.pop()
    }
    return { text: text.join('\n'), lines }
  }

  /** история над видимым экраном — последние HISTORY_ROWS строк прокрутки */
  history(): ScreenSeg[][] {
    const buf = this.term.buffer.active
    const end = Math.max(0, buf.length - this.term.rows)
    const cell = buf.getNullCell()
    const lines: ScreenSeg[][] = []
    for (let i = Math.max(0, end - HISTORY_ROWS); i < end; i++) {
      const line = buf.getLine(i)
      lines.push(line ? lineSegs(line, cell) : [])
    }
    return lines
  }

  dispose(): void {
    this.term.dispose()
  }
}
