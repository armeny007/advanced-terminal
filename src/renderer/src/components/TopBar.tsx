import { useState } from 'react'
import type { AppState, PageInfo, TermInfo } from '../../../shared/types'
import { pageBadge } from '../lib/status'

function PageTab({
  page,
  terms,
  active,
  onActivate,
  onRename,
  onDelete
}: {
  page: PageInfo
  terms: TermInfo[]
  active: boolean
  onActivate: () => void
  onRename: (name: string) => void
  onDelete: () => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(page.name)
  const badge = pageBadge(terms)

  const commit = (): void => {
    setEditing(false)
    const v = val.trim()
    if (v && v !== page.name) onRename(v)
    else setVal(page.name)
  }

  return (
    <div
      className={`tab ${active ? 'active' : ''}`}
      onClick={onActivate}
      onDoubleClick={() => {
        setVal(page.name)
        setEditing(true)
      }}
    >
      {editing ? (
        <input
          autoFocus
          className="tab-edit"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setVal(page.name)
              setEditing(false)
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <span className="tab-name">{page.name}</span>
          {badge && (
            <span
              className={`tab-badge ${badge.pulse ? 'pulse' : ''}`}
              style={{ background: badge.color, color: '#11111b' }}
            >
              {badge.text || '●'}
            </span>
          )}
          <span
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation()
              if (terms.length === 0 || window.confirm(`Удалить страницу «${page.name}»?`)) onDelete()
            }}
          >
            ×
          </span>
        </>
      )}
    </div>
  )
}

export function TopBar({
  state,
  view,
  onSetView,
  onOpenSessions,
  search,
  onSearchChange,
  onSearchFocus
}: {
  state: AppState
  view: 'grid' | 'dashboard'
  onSetView: (v: 'grid' | 'dashboard') => void
  onOpenSessions: () => void
  search: string
  onSearchChange: (v: string) => void
  onSearchFocus: () => void
}): React.JSX.Element {
  const termsOf = (pageId: string): TermInfo[] => state.terminals.filter((t) => t.pageId === pageId)

  const addPage = async (): Promise<void> => {
    const name = `Страница ${state.pages.length + 1}`
    const p = await window.api.createPage(name)
    window.api.setActivePage(p.id)
  }

  return (
    <div className="topbar">
      <div className="tabs">
        {state.pages.map((p) => (
          <PageTab
            key={p.id}
            page={p}
            terms={termsOf(p.id)}
            active={p.id === state.activePageId && view === 'grid'}
            onActivate={() => {
              onSetView('grid')
              window.api.setActivePage(p.id)
            }}
            onRename={(name) => window.api.renamePage(p.id, name)}
            onDelete={() => window.api.deletePage(p.id)}
          />
        ))}
        <button className="tab-add" onClick={addPage} title="Новая страница">
          +
        </button>
      </div>

      <div className="topbar-right">
        <button
          className={`btn ${view === 'dashboard' ? 'primary' : ''}`}
          onClick={() => onSetView(view === 'dashboard' ? 'grid' : 'dashboard')}
        >
          Дашборд
        </button>
        <button className="btn" onClick={onOpenSessions}>
          Сессии
        </button>
        <input
          className="global-search"
          placeholder="Поиск… (⌘K)"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={onSearchFocus}
        />
      </div>
    </div>
  )
}
