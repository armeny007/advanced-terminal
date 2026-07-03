import { useEffect, useMemo, useState } from 'react'
import type { ClaudeSessionMeta } from '../../../shared/types'
import { basename, shortenPath } from '../lib/status'
import { Modal } from '../lib/ui'

function formatDate(ms: number): string {
  const d = new Date(ms)
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${months[d.getMonth()]} ${hh}:${mm}`
}

export function SessionsBrowser({
  bindTermId,
  filterCwd,
  activePageId,
  onClose,
  onSessionsLoaded
}: {
  bindTermId: string | null
  filterCwd: string | null
  activePageId: string
  onClose: () => void
  onSessionsLoaded?: (s: ClaudeSessionMeta[]) => void
}): React.JSX.Element {
  const [sessions, setSessions] = useState<ClaudeSessionMeta[] | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    window.api.listClaudeSessions(filterCwd ?? undefined).then((s) => {
      setSessions(s)
      onSessionsLoaded?.(s)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCwd])

  const grouped = useMemo(() => {
    const q = filter.toLowerCase()
    const list = (sessions ?? []).filter(
      (s) => !q || s.projectPath.toLowerCase().includes(q) || s.firstMessage.toLowerCase().includes(q)
    )
    const map = new Map<string, ClaudeSessionMeta[]>()
    for (const s of list) {
      const arr = map.get(s.projectPath) ?? []
      arr.push(s)
      map.set(s.projectPath, arr)
    }
    return [...map.entries()]
  }, [sessions, filter])

  const pick = async (s: ClaudeSessionMeta): Promise<void> => {
    if (bindTermId) {
      await window.api.bindSession(bindTermId, s.sessionId)
    } else {
      const t = await window.api.createTerminal({
        pageId: activePageId,
        cwd: s.projectPath,
        name: basename(s.projectPath)
      })
      await window.api.runClaude(t.id, 'resume', s.sessionId)
    }
    onClose()
  }

  return (
    <Modal onClose={onClose} width="72%">
      <div className="modal-head">
        <h3>{bindTermId ? 'Привязать сессию Claude Code' : 'Сессии Claude Code'}</h3>
        <input
          autoFocus
          className="global-search"
          placeholder="Фильтр по пути и тексту…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="modal-body sessions-body">
        {sessions === null ? (
          <div className="muted">Загрузка сессий…</div>
        ) : grouped.length === 0 ? (
          <div className="muted">Сессии не найдены</div>
        ) : (
          grouped.map(([proj, list]) => (
            <div className="session-group" key={proj}>
              <div className="session-group-title">{shortenPath(proj)}</div>
              {list.map((s) => (
                <button className="session-row" key={s.sessionId} onClick={() => pick(s)}>
                  <div className="session-msg">{s.firstMessage || '(без текста)'}</div>
                  <div className="session-meta">
                    <span>{formatDate(s.updatedAt)}</span>
                    {s.gitBranch && <span className="badge">⑂ {s.gitBranch}</span>}
                    <span className="muted">{s.messageCount} сообщ.</span>
                  </div>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </Modal>
  )
}
