import { useState } from 'react'
import type { FolderInfo, TermInfo } from '../../../shared/types'
import { Menu } from '../lib/ui'
import { STATUS_COLOR, STATUS_LABEL, statusPulses } from '../lib/status'
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
  const [maximizedId, setMaximizedId] = useState<string | null>(null)
  // развёрнутый терминал мог быть закрыт/перемещён — сбрасываем
  const maxTerm = terminals.find((t) => t.id === maximizedId)
  const effMax = maxTerm ? maximizedId : null

  const cols = effMax ? 1 : terminals.length <= 1 ? 1 : terminals.length <= 4 ? 2 : 3

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
        {/* в режиме разворота — свёрнутые терминалы как названия в верхней строке */}
        {effMax && (
          <div className="folder-chips">
            <button className="btn small chip-tile" title="Показать все (плитка)" onClick={() => setMaximizedId(null)}>
              ▦ Плитка
            </button>
            {terminals
              .filter((t) => t.id !== effMax)
              .map((t) => (
                <button
                  key={t.id}
                  className="term-chip"
                  title={`${t.name} — ${STATUS_LABEL[t.status]}`}
                  onClick={() => setMaximizedId(t.id)}
                >
                  <span
                    className={`dot ${statusPulses(t.status) ? 'pulse' : ''}`}
                    style={{ background: STATUS_COLOR[t.status] }}
                  />
                  {t.name}
                </button>
              ))}
          </div>
        )}
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
              hidden={effMax != null && t.id !== effMax}
              maximized={t.id === effMax}
              onToggleMaximize={() => setMaximizedId((prev) => (prev === t.id ? null : t.id))}
              onOpenSessions={onOpenSessions}
              onWorktreeDiff={onWorktreeDiff}
            />
          ))}
        </div>
      )}
    </div>
  )
}
