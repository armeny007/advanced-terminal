import type { FolderInfo, TermInfo } from '../../../shared/types'
import { Menu } from '../lib/ui'
import { TerminalCard } from './TerminalCard'

export function Folder({
  folder,
  terminals,
  allFolders,
  active,
  highlightTermId,
  onNewTerminal,
  onNewInFolder,
  onNewWorktree,
  onOpenSessions,
  onWorktreeDiff
}: {
  folder: FolderInfo
  terminals: TermInfo[]
  allFolders: FolderInfo[]
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
    <div className="folder" style={{ display: active ? 'flex' : 'none' }}>
      <div className="folder-actions">
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
          <p>В этой папке пока нет терминалов</p>
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
              folders={allFolders}
              isActiveFolder={active}
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
