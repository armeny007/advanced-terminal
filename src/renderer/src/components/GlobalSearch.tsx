import { useMemo } from 'react'
import type { AppState, ClaudeSessionMeta, TermInfo } from '../../../shared/types'
import { basename, shortenPath } from '../lib/status'

export interface SearchResult {
  kind: 'terminal' | 'page' | 'session'
  id: string
  title: string
  subtitle: string
  term?: TermInfo
  session?: ClaudeSessionMeta
  pageId?: string
}

export function GlobalSearch({
  query,
  state,
  sessions,
  onClose,
  onPick
}: {
  query: string
  state: AppState
  sessions: ClaudeSessionMeta[]
  onClose: () => void
  onPick: (r: SearchResult) => void
}): React.JSX.Element | null {
  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: SearchResult[] = []
    for (const t of state.terminals) {
      if (t.name.toLowerCase().includes(q) || t.cwd.toLowerCase().includes(q)) {
        out.push({
          kind: 'terminal',
          id: t.id,
          title: t.name,
          subtitle: shortenPath(t.cwd),
          term: t
        })
      }
    }
    for (const p of state.pages) {
      if (p.name.toLowerCase().includes(q)) {
        out.push({ kind: 'page', id: p.id, title: p.name, subtitle: 'страница', pageId: p.id })
      }
    }
    for (const s of sessions) {
      if (s.firstMessage.toLowerCase().includes(q) || s.projectPath.toLowerCase().includes(q)) {
        out.push({
          kind: 'session',
          id: s.sessionId,
          title: s.firstMessage || basename(s.projectPath),
          subtitle: shortenPath(s.projectPath),
          session: s
        })
        if (out.filter((r) => r.kind === 'session').length >= 20) break
      }
    }
    return out
  }, [query, state, sessions])

  if (!query.trim()) return null

  const icon = { terminal: '▢', page: '❏', session: '⟲' }

  return (
    <div className="search-dropdown">
      {results.length === 0 ? (
        <div className="muted small pad">Ничего не найдено</div>
      ) : (
        results.map((r) => (
          <button
            key={r.kind + r.id}
            className="search-item"
            onClick={() => {
              onPick(r)
              onClose()
            }}
          >
            <span className="search-icon">{icon[r.kind]}</span>
            <span className="search-title">{r.title}</span>
            <span className="search-sub muted">{r.subtitle}</span>
          </button>
        ))
      )}
    </div>
  )
}
