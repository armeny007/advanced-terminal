import { Fragment, useState } from 'react'
import type { AppState, TermInfo } from '../../../shared/types'
import { STATUS_COLOR, STATUS_LABEL, statusPulses } from '../lib/status'

/** Левая убирающаяся панель: все терминалы по вкладкам, клик — показать терминал.
 *  Терминалы перетаскиваются: на другой терминал — встаёт перед ним, на заголовок вкладки — в её конец */
export function Sidebar({
  state,
  activeFolderId,
  currentTermId,
  onPickTerm
}: {
  state: AppState
  activeFolderId: string
  currentTermId: string | null
  onPickTerm: (t: TermInfo) => void
}): React.JSX.Element {
  const folders = state.folders.filter((f) => !state.detachedFolderIds.includes(f.id))
  const [dragId, setDragId] = useState<string | null>(null)
  // куда сейчас наведён перетаскиваемый терминал: 'term:<id>' | 'folder:<id>'
  const [over, setOver] = useState<string | null>(null)
  // свёрнутые разделы — помним между запусками
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('advterm.sidebar.collapsed') || '[]')
    } catch {
      return []
    }
  })
  const toggleCollapsed = (id: string): void => {
    const next = collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id]
    setCollapsed(next)
    localStorage.setItem('advterm.sidebar.collapsed', JSON.stringify(next))
  }

  const drop = (folderId: string, beforeId: string | null): void => {
    if (dragId && dragId !== beforeId) void window.api.moveTerminal(dragId, folderId, beforeId)
    setDragId(null)
    setOver(null)
  }
  const dragOver = (key: string) => (e: React.DragEvent) => {
    if (!dragId) return
    e.preventDefault()
    if (over !== key) setOver(key)
  }

  return (
    <aside className="sidebar">
      {folders.map((f) => {
        const all = state.terminals.filter((t) => t.folderId === f.id)
        // архивные — в конце списка вкладки, за разделителем
        const live = all.filter((t) => !t.archived)
        const terms = [...live, ...all.filter((t) => t.archived)]
        const isCollapsed = collapsed.includes(f.id)
        return (
          <div key={f.id} className={`sb-folder ${f.id === activeFolderId ? 'active' : ''}`}>
            <button
              className={`sb-folder-head ${over === `folder:${f.id}` ? 'drop-into' : ''}`}
              onClick={() => window.api.setActiveFolder(f.id)}
              onDragOver={dragOver(`folder:${f.id}`)}
              onDragLeave={() => setOver(null)}
              onDrop={() => drop(f.id, null)}
            >
              <span
                className="sb-chevron"
                title={isCollapsed ? 'Развернуть' : 'Свернуть'}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleCollapsed(f.id)
                }}
              >
                {isCollapsed ? '▸' : '▾'}
              </span>
              {f.icon ? (
                <span className="tab-icon">{f.icon}</span>
              ) : (
                <span className="tab-dot" style={{ background: f.color || '#6c7086' }} />
              )}
              <span className="sb-folder-name">{f.name}</span>
              <span className="muted small">{terms.length}</span>
            </button>
            {!isCollapsed &&
              terms.map((t, i) => (
                <Fragment key={t.id}>
                  {i === live.length && <div className="sb-archive-divider">📦 архив</div>}
                  <button
                    className={`sb-term ${t.archived ? 'archived' : ''} ${t.id === currentTermId ? 'current' : ''} ${dragId === t.id ? 'dragging' : ''} ${
                      over === `term:${t.id}` && dragId !== t.id ? 'drop-before' : ''
                    }`}
                    title={`${t.name} — ${STATUS_LABEL[t.status]}\n${t.cwd}`}
                    onClick={() => onPickTerm(t)}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      setDragId(t.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOver(null)
                    }}
                    onDragOver={dragOver(`term:${t.id}`)}
                    onDragLeave={() => setOver(null)}
                    onDrop={() => drop(f.id, t.id)}
                  >
                    <span
                      className={`dot ${statusPulses(t.status) ? 'pulse' : ''}`}
                      style={{ background: STATUS_COLOR[t.status] }}
                    />
                    <span className="sb-term-name">
                      {t.archived && '📦 '}
                      {t.name}
                    </span>
                    {t.sshHost && <span className="sb-ssh">⇅</span>}
                  </button>
                </Fragment>
              ))}
          </div>
        )
      })}
    </aside>
  )
}
