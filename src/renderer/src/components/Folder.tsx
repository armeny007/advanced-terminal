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
  onNewClaudeSession,
  onOpenSessions,
  onChangeCwd,
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
  onNewClaudeSession: (term: TermInfo) => void
  onOpenSessions: (bindTermId: string, cwd: string) => void
  onChangeCwd: (term: TermInfo) => void
  onWorktreeDiff: (term: TermInfo) => void
}): React.JSX.Element {
  const [maximizedId, setMaximizedId] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  // архивные терминалы живут (xterm смонтирован, shell работает), но в плитке не показываются
  const shown = terminals.filter((t) => !t.archived)
  const archived = terminals.filter((t) => t.archived)
  // развёрнутый терминал мог быть закрыт/перемещён/заархивирован — сбрасываем
  const maxTerm = shown.find((t) => t.id === maximizedId)
  const effMax = maxTerm ? maximizedId : null

  const cols = effMax ? 1 : shown.length <= 1 ? 1 : shown.length <= 4 ? 2 : 3

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
            {shown
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
                  <span className="chip-name">{t.name}</span>
                </button>
              ))}
          </div>
        )}
        <span className="spacer" />
        <span className="muted small">
          {shown.length} терм.{archived.length > 0 && ` · в архиве ${archived.length}`}
        </span>
      </div>

      <div className="folder-body">
        {shown.length === 0 ? (
          <div className="empty">
            <p>В этой папке пока нет терминалов</p>
            <button className="btn primary" onClick={onNewTerminal}>
              + Терминал
            </button>
          </div>
        ) : null}
        {/* карточки рендерим все (архивные — скрытыми), чтобы xterm не пересоздавался */}
        <div
          className="term-grid"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, display: shown.length === 0 ? 'none' : undefined }}
        >
          {terminals.map((t) => (
            <TerminalCard
              key={t.id}
              term={t}
              folders={allFolders}
              isActiveFolder={active}
              highlighted={highlightTermId === t.id}
              hidden={t.archived || (effMax != null && t.id !== effMax)}
              maximized={t.id === effMax}
              onToggleMaximize={() => setMaximizedId((prev) => (prev === t.id ? null : t.id))}
              onNewClaudeSession={onNewClaudeSession}
              onOpenSessions={onOpenSessions}
              onChangeCwd={onChangeCwd}
              onWorktreeDiff={onWorktreeDiff}
            />
          ))}
        </div>

        {/* правая группа «Архив»: отложенные терминалы вкладки, возвращаются кнопкой.
            Свёрнута в узкую полоску, чтобы не отнимать место у плитки */}
        {archived.length > 0 && !archiveOpen && (
          <button className="folder-archive-strip" title="Показать архив" onClick={() => setArchiveOpen(true)}>
            <span>📦</span>
            <span>{archived.length}</span>
          </button>
        )}
        {archived.length > 0 && archiveOpen && (
          <aside className="folder-archive">
            <div className="folder-archive-title">
              <span>📦 Архив</span>
              <button className="icon-btn" title="Свернуть" onClick={() => setArchiveOpen(false)}>
                ›
              </button>
            </div>
            {archived.map((t) => (
              <div key={t.id} className="archive-item" title={`${t.name} — ${STATUS_LABEL[t.status]}\n${t.cwd}`}>
                <span
                  className={`dot ${statusPulses(t.status) ? 'pulse' : ''}`}
                  style={{ background: STATUS_COLOR[t.status] }}
                />
                <span className="chip-name">{t.name}</span>
                <button
                  className="icon-btn"
                  title="Вернуть из архива"
                  onClick={() => window.api.setTerminalArchived(t.id, false)}
                >
                  ↩
                </button>
              </div>
            ))}
          </aside>
        )}
      </div>
    </div>
  )
}
