import { useEffect, useState } from 'react'
import type { AppState, ClaudeStatus, PageInfo, TermInfo } from '../../../shared/types'
import { bus } from '../lib/bus'
import { STATUS_COLOR, STATUS_LABEL, shortenPath, statusPulses } from '../lib/status'

const GROUPS: { title: string; match: (s: ClaudeStatus) => boolean }[] = [
  { title: 'Требуют внимания', match: (s) => s === 'permission' || s === 'needs_input' },
  { title: 'Работают', match: (s) => s === 'working' },
  { title: 'Свободны', match: (s) => s === 'idle' },
  { title: 'Без Claude', match: (s) => s === 'none' }
]

function DashRow({
  term,
  page,
  onOpen
}: {
  term: TermInfo
  page: PageInfo | undefined
  onOpen: () => void
}): React.JSX.Element {
  const [cmd, setCmd] = useState('')
  // периодически обновляем превью строк из буфера xterm
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1500)
    return () => clearInterval(id)
  }, [])
  const lines = bus.lastLines(term.id, 3)

  return (
    <div className="dash-row">
      <span
        className={`dot ${statusPulses(term.status) ? 'pulse' : ''}`}
        style={{ background: STATUS_COLOR[term.status] }}
      />
      <div className="dash-main">
        <div className="dash-line1">
          <span className="dash-name">{term.name}</span>
          <span className="muted small">{page?.name}</span>
          <span className="muted small">· {shortenPath(term.cwd)}</span>
          {term.worktree && <span className="badge wt-badge">⑂ {term.worktree.branch}</span>}
        </div>
        {lines.length > 0 && (
          <pre className="dash-preview">{lines.join('\n')}</pre>
        )}
        <div className="dash-cmd">
          <input
            placeholder="Отправить команду…"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && cmd) {
                window.api.writeTerminal(term.id, cmd + '\r')
                setCmd('')
              }
            }}
          />
        </div>
      </div>
      <button className="btn" onClick={onOpen}>
        Открыть
      </button>
    </div>
  )
}

export function Dashboard({
  state,
  onOpenTerm
}: {
  state: AppState
  onOpenTerm: (term: TermInfo) => void
}): React.JSX.Element {
  const pageById = (id: string): PageInfo | undefined => state.pages.find((p) => p.id === id)

  if (state.terminals.length === 0) {
    return (
      <div className="dashboard">
        <div className="empty">
          <p>Нет ни одного терминала</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      {GROUPS.map((g) => {
        const items = state.terminals.filter((t) => g.match(t.status))
        if (items.length === 0) return null
        return (
          <div className="dash-group" key={g.title}>
            <div className="dash-group-title">
              {g.title} <span className="muted">({items.length})</span>
            </div>
            {items.map((t) => (
              <DashRow key={t.id} term={t} page={pageById(t.pageId)} onOpen={() => onOpenTerm(t)} />
            ))}
          </div>
        )
      })}
      <div className="muted small dash-legend">
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <span key={k}>
            <span className="dot" style={{ background: STATUS_COLOR[k as ClaudeStatus] }} /> {v}
          </span>
        ))}
      </div>
    </div>
  )
}
