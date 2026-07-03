import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import type { FolderInfo, TermInfo } from '../../../shared/types'
import { bus } from '../lib/bus'
import { STATUS_COLOR, STATUS_LABEL, shortenPath, statusPulses } from '../lib/status'
import { Menu } from '../lib/ui'
import type { MenuItem } from '../lib/ui'
import { UsagePopover } from './UsagePopover'

const THEME = {
  background: '#181825',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  selectionBackground: '#414458',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8'
}

function safeFit(fit: FitAddon, el: HTMLElement): { cols: number; rows: number } | null {
  if (!el.offsetParent || el.clientWidth < 20 || el.clientHeight < 20) return null
  try {
    const dims = fit.proposeDimensions()
    fit.fit()
    return dims ?? null
  } catch {
    return null
  }
}

export function TerminalCard({
  term,
  folders,
  isActiveFolder,
  highlighted,
  onOpenSessions,
  onWorktreeDiff
}: {
  term: TermInfo
  folders: FolderInfo[]
  isActiveFolder: boolean
  highlighted: boolean
  onOpenSessions: (bindTermId: string, cwd: string) => void
  onWorktreeDiff: (term: TermInfo) => void
}): React.JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [usageOpen, setUsageOpen] = useState(false)
  const [exited, setExited] = useState(!term.alive)

  // xterm живёт всё время существования терминала (создание/уничтожение — один раз)
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const xterm = new Terminal({
      scrollback: 20000,
      fontSize: 13,
      fontFamily: 'SF Mono, Menlo, monospace',
      cursorBlink: true,
      theme: THEME,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    xterm.loadAddon(fit)
    xterm.loadAddon(search)
    xterm.open(el)
    fitRef.current = fit
    searchRef.current = search
    bus.register(term.id, xterm)

    const dims = safeFit(fit, el)
    if (dims) window.api.resizeTerminal(term.id, dims.cols, dims.rows)

    const dataSub = xterm.onData((d) => window.api.writeTerminal(term.id, d))
    const ta = el.querySelector('textarea')
    const onFocus = (): void => window.api.setFocusedTerm(term.id)
    const onBlur = (): void => window.api.setFocusedTerm(null)
    ta?.addEventListener('focus', onFocus)
    ta?.addEventListener('blur', onBlur)

    const ro = new ResizeObserver(() => {
      const d = safeFit(fit, el)
      if (d) window.api.resizeTerminal(term.id, d.cols, d.rows)
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      dataSub.dispose()
      ta?.removeEventListener('focus', onFocus)
      ta?.removeEventListener('blur', onBlur)
      bus.dispose(term.id)
      xterm.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term.id])

  // папка стала активной — подогнать размер (в скрытом состоянии fit не работает)
  useEffect(() => {
    if (!isActiveFolder) return
    const el = bodyRef.current
    const fit = fitRef.current
    if (!el || !fit) return
    const id = requestAnimationFrame(() => {
      const d = safeFit(fit, el)
      if (d) window.api.resizeTerminal(term.id, d.cols, d.rows)
    })
    return () => cancelAnimationFrame(id)
  }, [isActiveFolder, term.id])

  useEffect(() => setExited(!term.alive), [term.alive])

  useEffect(() => {
    const off = window.api.onTermExit((id) => {
      if (id === term.id) setExited(true)
    })
    return off
  }, [term.id])

  // Cmd+F открывает поиск, когда фокус в этом терминале
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        const el = bodyRef.current
        if (el && el.contains(document.activeElement)) {
          e.preventDefault()
          setSearchOpen(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rename = (): void => {
    const name = window.prompt('Имя терминала', term.name)
    if (name && name.trim()) window.api.renameTerminal(term.id, name.trim())
  }

  const claudeItems: MenuItem[] = [
    { label: 'Новая сессия', onClick: () => window.api.runClaude(term.id, 'new') },
    { label: 'Продолжить последнюю', onClick: () => window.api.runClaude(term.id, 'continue') },
    {
      label: 'Возобновить привязанную',
      disabled: !term.claudeSessionId,
      onClick: () =>
        term.claudeSessionId && window.api.runClaude(term.id, 'resume', term.claudeSessionId)
    }
  ]

  const moveItems: MenuItem[] = folders
    .filter((p) => p.id !== term.folderId)
    .map((p) => ({ label: p.name, onClick: () => window.api.moveTerminalToFolder(term.id, p.id) }))

  const actionItems: MenuItem[] = [
    { label: 'Переместить в папку', submenu: moveItems.length ? moveItems : [{ label: '(нет других)', disabled: true }] },
    { label: 'Привязать сессию…', onClick: () => onOpenSessions(term.id, term.cwd) },
    ...(term.worktree
      ? [
          { label: 'Diff worktree', onClick: () => onWorktreeDiff(term) },
          {
            label: 'Удалить worktree',
            danger: true,
            onClick: () => {
              if (window.confirm('Удалить worktree и его терминал?')) window.api.removeWorktree(term.id)
            }
          }
        ]
      : []),
    { label: 'Перезапустить shell', onClick: () => window.api.restartTerminal(term.id) },
    {
      label: 'Закрыть',
      danger: true,
      onClick: () => {
        if (window.confirm(`Закрыть терминал «${term.name}»?`)) window.api.closeTerminal(term.id)
      }
    }
  ]

  const runSearch = (dir: 'next' | 'prev', text = searchText): void => {
    if (!text) return
    const s = searchRef.current
    if (dir === 'next') s?.findNext(text)
    else s?.findPrevious(text)
  }

  return (
    <div className={`term-card ${highlighted ? 'highlight' : ''}`}>
      <div className="term-head">
        <span
          className={`dot ${statusPulses(term.status) ? 'pulse' : ''}`}
          style={{ background: STATUS_COLOR[term.status] }}
          title={STATUS_LABEL[term.status]}
        />
        <span className="term-name" onDoubleClick={rename} title="Двойной клик — переименовать">
          {term.name}
        </span>
        <span className="term-cwd">{shortenPath(term.cwd)}</span>
        {term.worktree && <span className="badge wt-badge">⑂ {term.worktree.branch}</span>}
        {term.claudeSessionId && (
          <span className="badge session-badge" title={term.claudeSessionId}>
            {term.claudeSessionId.slice(0, 8)}
          </span>
        )}
        <div className="term-actions">
          <Menu
            align="right"
            trigger={(_o, toggle) => (
              <button className="icon-btn" onClick={toggle}>
                Claude ▾
              </button>
            )}
            items={claudeItems}
          />
          <button className="icon-btn" title="Поиск (⌘F)" onClick={() => setSearchOpen((v) => !v)}>
            🔍
          </button>
          <div className="menu-wrap">
            <button className="icon-btn" title="Расход токенов" onClick={() => setUsageOpen((v) => !v)}>
              📊
            </button>
            {usageOpen && (
              <UsagePopover
                projectPath={term.cwd}
                sessionId={term.claudeSessionId}
                onClose={() => setUsageOpen(false)}
              />
            )}
          </div>
          <Menu
            align="right"
            trigger={(_o, toggle) => (
              <button className="icon-btn" onClick={toggle}>
                ⋯
              </button>
            )}
            items={actionItems}
          />
        </div>
      </div>

      {searchOpen && (
        <div className="term-search">
          <input
            autoFocus
            placeholder="Поиск в выводе…"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value)
              runSearch('next', e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') runSearch(e.shiftKey ? 'prev' : 'next')
              if (e.key === 'Escape') setSearchOpen(false)
            }}
          />
          <button className="icon-btn" onClick={() => runSearch('prev')}>
            ↑
          </button>
          <button className="icon-btn" onClick={() => runSearch('next')}>
            ↓
          </button>
          <button className="icon-btn" onClick={() => setSearchOpen(false)}>
            ✕
          </button>
        </div>
      )}

      <div className="term-body-wrap">
        <div className="term-body" ref={bodyRef} />
        {exited && (
          <div className="term-overlay">
            <div>Процесс завершён</div>
            <button className="btn" onClick={() => window.api.restartTerminal(term.id)}>
              Перезапустить
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
