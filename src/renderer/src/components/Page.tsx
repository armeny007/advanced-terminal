import type { PageInfo, TermInfo } from '../../../shared/types'
import { Menu } from '../lib/ui'
import { TerminalCard } from './TerminalCard'

export function Page({
  page,
  terminals,
  allPages,
  active,
  highlightTermId,
  onNewTerminal,
  onNewInFolder,
  onNewWorktree,
  onOpenSessions,
  onWorktreeDiff
}: {
  page: PageInfo
  terminals: TermInfo[]
  allPages: PageInfo[]
  active: boolean
  highlightTermId: string | null
  onNewTerminal: () => void
  onNewInFolder: () => void
  onNewWorktree: () => void
  onOpenSessions: (bindTermId: string, cwd: string) => void
  onWorktreeDiff: (term: TermInfo) => void
}): React.JSX.Element {
  const cols = terminals.length <= 1 ? 1 : terminals.length <= 4 ? 2 : 3

  return (
    <div className="page" style={{ display: active ? 'flex' : 'none' }}>
      <div className="page-actions">
        <button className="btn primary" onClick={onNewTerminal}>
          + Терминал
        </button>
        <Menu
          trigger={(_o, toggle) => (
            <button className="btn" onClick={toggle}>
              ▾
            </button>
          )}
          items={[
            { label: 'Терминал в папке…', onClick: onNewInFolder },
            { label: 'Терминал в worktree…', onClick: onNewWorktree }
          ]}
        />
        <span className="spacer" />
        <span className="muted small">{terminals.length} терм.</span>
      </div>

      {terminals.length === 0 ? (
        <div className="empty">
          <p>На этой странице пока нет терминалов</p>
          <button className="btn primary" onClick={onNewTerminal}>
            + Терминал
          </button>
        </div>
      ) : (
        <div className="term-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {terminals.map((t) => (
            <TerminalCard
              key={t.id}
              term={t}
              pages={allPages}
              isActivePage={active}
              highlighted={highlightTermId === t.id}
              onOpenSessions={onOpenSessions}
              onWorktreeDiff={onWorktreeDiff}
            />
          ))}
        </div>
      )}
    </div>
  )
}
