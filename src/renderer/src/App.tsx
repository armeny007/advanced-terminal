import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClaudeSessionMeta, TermInfo } from '../../shared/types'
import { bus } from './lib/bus'
import { useAppState } from './lib/useAppState'
import { basename } from './lib/status'
import { TopBar } from './components/TopBar'
import { Folder } from './components/Folder'
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

/** soloFolderId задан у окна отдельной папки (режим одной папки без вкладок) */
export default function App({ soloFolderId }: { soloFolderId?: string }): React.JSX.Element {
  const solo = soloFolderId != null
  const state = useAppState()
  const [view, setView] = useState<'grid' | 'dashboard'>('grid')
  const [modal, setModal] = useState<Modal>(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlight, setHighlight] = useState<string | null>(null)
  const sessionsCache = useRef<ClaudeSessionMeta[]>([])
  const [hooksDismissed, setHooksDismissed] = useState(false)

  useEffect(() => bus.start(), [])

  useEffect(() => {
    window.api.listClaudeSessions().then((s) => (sessionsCache.current = s))
  }, [])

  // В главном окне не показываем вынесенные папки; окно отдельной папки — только её.
  const soloFolder = solo ? state.folders.find((f) => f.id === soloFolderId) : undefined
  const visibleFolders = solo
    ? soloFolder
      ? [soloFolder]
      : []
    : state.folders.filter((f) => !state.detachedFolderIds.includes(f.id))
  const activeId = solo
    ? soloFolderId!
    : state.detachedFolderIds.includes(state.activeFolderId)
      ? (visibleFolders[0]?.id ?? state.activeFolderId)
      : state.activeFolderId
  const effectiveFolderId = solo ? soloFolderId! : state.activeFolderId

  const revealTerm = useCallback(
    (term: TermInfo) => {
      if (solo && term.folderId !== soloFolderId) return
      setView('grid')
      if (!solo) window.api.setActiveFolder(term.folderId)
      setHighlight(term.id)
      setTimeout(() => bus.focus(term.id), 120)
      setTimeout(() => setHighlight(null), 1500)
    },
    [solo, soloFolderId]
  )

  useEffect(() => {
    return window.api.onRevealTerm((termId) => {
      const t = state.terminals.find((x) => x.id === termId)
      if (t) revealTerm(t)
    })
  }, [state.terminals, revealTerm])

  const newTerminal = useCallback(
    (cwd?: string) => {
      window.api.createTerminal({ folderId: effectiveFolderId, cwd })
    },
    [effectiveFolderId]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!solo && (e.metaKey || e.ctrlKey) && e.key === 'k') {
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
  }, [newTerminal, solo])

  const pickSearch = (r: SearchResult): void => {
    setSearch('')
    setSearchOpen(false)
    if (r.kind === 'terminal' && r.term) revealTerm(r.term)
    else if (r.kind === 'folder' && r.folderId) {
      setView('grid')
      window.api.setActiveFolder(r.folderId)
    } else if (r.kind === 'session' && r.session) {
      const s = r.session
      window.api
        .createTerminal({ folderId: effectiveFolderId, cwd: s.projectPath, name: basename(s.projectPath) })
        .then((t) => window.api.runClaude(t.id, 'resume', s.sessionId))
    }
  }

  const openSessions = (bindTermId: string, cwd: string): void =>
    setModal({ type: 'sessions', bindTermId, filterCwd: cwd })

  const lastCwd = state.terminals.length > 0 ? state.terminals[state.terminals.length - 1].cwd : ''

  const renderFolder = (folderId: string): React.JSX.Element | null => {
    const f = visibleFolders.find((x) => x.id === folderId)
    if (!f) return null
    return (
      <Folder
        key={f.id}
        folder={f}
        terminals={state.terminals.filter((t) => t.folderId === f.id)}
        allFolders={state.folders}
        active={f.id === activeId}
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
    )
  }

  return (
    <div className="app">
      {solo ? (
        <div className="topbar solo-topbar">
          <span className="solo-title">
            {soloFolder?.icon && <span className="tab-icon">{soloFolder.icon}</span>}
            <span
              className="solo-dot"
              style={{ background: soloFolder?.color || '#6c7086' }}
            />
            {soloFolder?.name ?? 'Папка'}
          </span>
          <div className="topbar-right">
            <button className="btn primary" onClick={() => newTerminal()}>
              + Терминал
            </button>
            <button className="btn" onClick={() => window.api.attachFolder(soloFolderId!)}>
              ⧉ Вернуть в главное окно
            </button>
          </div>
        </div>
      ) : (
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
      )}

      {!solo && searchOpen && search.trim() && (
        <GlobalSearch
          query={search}
          state={state}
          sessions={sessionsCache.current}
          onClose={() => setSearchOpen(false)}
          onPick={pickSearch}
        />
      )}

      {!solo && !state.hooksInstalled && !hooksDismissed && (
        <div className="hooks-banner">
          <span>Для индикаторов статуса Claude Code нужно установить hooks в ~/.claude/settings.json</span>
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
        {solo ? (
          soloFolder ? (
            renderFolder(soloFolderId!)
          ) : (
            <div className="empty">
              <p>Папка закрыта</p>
            </div>
          )
        ) : view === 'dashboard' ? (
          <Dashboard state={state} onOpenTerm={revealTerm} />
        ) : (
          visibleFolders.map((p) => renderFolder(p.id))
        )}
      </div>

      {modal?.type === 'sessions' && (
        <SessionsBrowser
          bindTermId={modal.bindTermId}
          filterCwd={modal.filterCwd}
          activeFolderId={effectiveFolderId}
          onClose={() => setModal(null)}
          onSessionsLoaded={(s) => (sessionsCache.current = s)}
        />
      )}
      {modal?.type === 'worktree' && (
        <WorktreeDialog
          defaultProjectPath={lastCwd}
          activeFolderId={effectiveFolderId}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'diff' && <DiffModal term={modal.term} onClose={() => setModal(null)} />}
    </div>
  )
}
