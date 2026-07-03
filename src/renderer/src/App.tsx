import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClaudeSessionMeta, TermInfo } from '../../shared/types'
import { bus } from './lib/bus'
import { useAppState } from './lib/useAppState'
import { basename } from './lib/status'
import { TopBar } from './components/TopBar'
import { Page } from './components/Page'
import { Dashboard } from './components/Dashboard'
import { SessionsBrowser } from './components/SessionsBrowser'
import { GlobalSearch } from './components/GlobalSearch'
import type { SearchResult } from './components/GlobalSearch'
import { WorktreeDialog } from './components/WorktreeDialog'
import { DiffModal } from './components/DiffModal'

type Modal =
  | { type: 'sessions'; bindTermId: string | null; filterCwd: string | null }
  | { type: 'worktree' }
  | { type: 'diff'; term: TermInfo }
  | null

export default function App(): React.JSX.Element {
  const state = useAppState()
  const [view, setView] = useState<'grid' | 'dashboard'>('grid')
  const [modal, setModal] = useState<Modal>(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const sessionsCache = useRef<ClaudeSessionMeta[]>([])
  const [hooksDismissed, setHooksDismissed] = useState(false)

  useEffect(() => bus.start(), [])

  // кэш сессий для глобального поиска
  useEffect(() => {
    window.api.listClaudeSessions().then((s) => (sessionsCache.current = s))
  }, [])

  const revealTerm = useCallback(
    (term: TermInfo) => {
      setView('grid')
      window.api.setActivePage(term.pageId)
      setHighlight(term.id)
      setTimeout(() => bus.focus(term.id), 120)
      setTimeout(() => setHighlight(null), 1500)
    },
    []
  )

  // клик по системному уведомлению
  useEffect(() => {
    return window.api.onRevealTerm((termId) => {
      const t = state.terminals.find((x) => x.id === termId)
      if (t) revealTerm(t)
    })
  }, [state.terminals, revealTerm])

  const newTerminal = useCallback(
    (cwd?: string) => {
      window.api.createTerminal({ pageId: state.activePageId, cwd })
    },
    [state.activePageId]
  )

  // горячие клавиши
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        ;(document.querySelector('.global-search') as HTMLInputElement | null)?.focus()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        newTerminal()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newTerminal])

  const pickSearch = (r: SearchResult): void => {
    setSearch('')
    setSearchOpen(false)
    if (r.kind === 'terminal' && r.term) revealTerm(r.term)
    else if (r.kind === 'page' && r.pageId) {
      setView('grid')
      window.api.setActivePage(r.pageId)
    } else if (r.kind === 'session' && r.session) {
      const s = r.session
      window.api.createTerminal({ pageId: state.activePageId, cwd: s.projectPath, name: basename(s.projectPath) }).then((t) => window.api.runClaude(t.id, 'resume', s.sessionId))
    }
  }

  const openSessions = (bindTermId: string, cwd: string): void =>
    setModal({ type: 'sessions', bindTermId, filterCwd: cwd })

  const lastCwd =
    state.terminals.length > 0 ? state.terminals[state.terminals.length - 1].cwd : ''

  return (
    <div className="app">
      <TopBar
        state={state}
        view={view}
        onSetView={setView}
        onOpenSessions={() => setModal({ type: 'sessions', bindTermId: null, filterCwd: null })}
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setSearchOpen(true)
        }}
        onSearchFocus={() => setSearchOpen(true)}
      />

      {searchOpen && search.trim() && (
        <GlobalSearch
          query={search}
          state={state}
          sessions={sessionsCache.current}
          onClose={() => setSearchOpen(false)}
          onPick={pickSearch}
        />
      )}

      {!state.hooksInstalled && !hooksDismissed && (
        <div className="hooks-banner">
          <span>
            Для индикаторов статуса Claude Code нужно установить hooks в ~/.claude/settings.json
          </span>
          <button
            className="btn small"
            onClick={async () => {
              const res = await window.api.installHooks()
              if (!res.ok) window.alert('Не удалось установить hooks: ' + (res.error ?? ''))
            }}
          >
            Установить
          </button>
          <button className="btn small ghost" onClick={() => setHooksDismissed(true)}>
            Скрыть
          </button>
        </div>
      )}

      <div className="content">
        {view === 'dashboard' ? (
          <Dashboard state={state} onOpenTerm={revealTerm} />
        ) : (
          state.pages.map((p) => (
            <Page
              key={p.id}
              page={p}
              terminals={state.terminals.filter((t) => t.pageId === p.id)}
              allPages={state.pages}
              active={p.id === state.activePageId}
              highlightTermId={highlight}
              onNewTerminal={() => newTerminal()}
              onNewInFolder={() => {
                const dir = window.prompt('Путь к папке', lastCwd || undefined)
                if (dir) newTerminal(dir)
              }}
              onNewWorktree={() => setModal({ type: 'worktree' })}
              onOpenSessions={openSessions}
              onWorktreeDiff={(term) => setModal({ type: 'diff', term })}
            />
          ))
        )}
      </div>

      {modal?.type === 'sessions' && (
        <SessionsBrowser
          bindTermId={modal.bindTermId}
          filterCwd={modal.filterCwd}
          activePageId={state.activePageId}
          onClose={() => setModal(null)}
          onSessionsLoaded={(s) => (sessionsCache.current = s)}
        />
      )}
      {modal?.type === 'worktree' && (
        <WorktreeDialog
          defaultProjectPath={lastCwd}
          activePageId={state.activePageId}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'diff' && (
        <DiffModal term={modal.term} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
