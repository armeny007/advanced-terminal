import { useState } from 'react'
import type { AppState, FolderInfo, TermInfo } from '../../../shared/types'
import { folderBadge } from '../lib/status'
import { useDismiss } from '../lib/ui'

const FOLDER_PALETTE = ['#89b4fa', '#a6e3a1', '#fab387', '#f38ba8', '#cba6f7', '#94e2d5', '#f9e2af', '#6c7086']
const FOLDER_EMOJIS = ['💼', '🚀', '💬', '🐛', '📦', '⚙️', '🔧', '🧪', '📊', '🌐', '🔬', '✨']

function FolderEditPopover({
  folder,
  onClose,
  onDelete
}: {
  folder: FolderInfo
  onClose: () => void
  onDelete: () => void
}): React.JSX.Element {
  const ref = useDismiss(onClose, true)
  const [name, setName] = useState(folder.name)

  const commitName = (): void => {
    const v = name.trim()
    if (v && v !== folder.name) window.api.updateFolder(folder.id, { name: v })
  }

  return (
    <div className="folder-edit-pop" ref={ref} onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        className="folder-edit-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitName()
            onClose()
          }
          if (e.key === 'Escape') onClose()
        }}
      />
      <div className="swatches">
        {FOLDER_PALETTE.map((c) => (
          <button
            key={c}
            className={`sw ${folder.color === c ? 'active' : ''}`}
            style={{ background: c }}
            title={c}
            onClick={() => window.api.updateFolder(folder.id, { color: c })}
          />
        ))}
      </div>
      <div className="emoji-row">
        {FOLDER_EMOJIS.map((e) => (
          <button
            key={e}
            className={`emoji ${folder.icon === e ? 'active' : ''}`}
            onClick={() => window.api.updateFolder(folder.id, { icon: e })}
          >
            {e}
          </button>
        ))}
        <button className="emoji" title="Без иконки" onClick={() => window.api.updateFolder(folder.id, { icon: '' })}>
          ⃠
        </button>
      </div>
      <button
        className="btn small folder-delete-btn"
        onClick={() => {
          if (window.confirm(`Удалить папку «${folder.name}»? Терминалы перейдут в первую папку.`)) {
            onDelete()
            onClose()
          }
        }}
      >
        Удалить папку
      </button>
    </div>
  )
}

function FolderTab({
  folder,
  terms,
  active,
  onActivate,
  onRename,
  onDelete
}: {
  folder: FolderInfo
  terms: TermInfo[]
  active: boolean
  onActivate: () => void
  onRename: (name: string) => void
  onDelete: () => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [popover, setPopover] = useState(false)
  const [val, setVal] = useState(folder.name)
  const badge = folderBadge(terms)
  const accent = folder.color || '#6c7086'

  const commit = (): void => {
    setEditing(false)
    const v = val.trim()
    if (v && v !== folder.name) onRename(v)
    else setVal(folder.name)
  }

  return (
    <div
      className={`tab ${active ? 'active' : ''}`}
      style={active ? { borderBottomColor: accent } : undefined}
      onClick={onActivate}
      onDoubleClick={() => {
        setVal(folder.name)
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
              setVal(folder.name)
              setEditing(false)
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          {folder.icon ? (
            <span className="tab-icon">{folder.icon}</span>
          ) : (
            <span className="tab-dot" style={{ background: accent }} />
          )}
          <span className="tab-name">{folder.name}</span>
          {badge && (
            <span
              className={`tab-badge ${badge.pulse ? 'pulse' : ''}`}
              style={{ background: badge.color, color: '#11111b' }}
            >
              {badge.text || '●'}
            </span>
          )}
          <button
            className="tab-editbtn"
            title="Редактировать папку"
            onClick={(e) => {
              e.stopPropagation()
              setPopover((v) => !v)
            }}
          >
            ✎
          </button>
          {popover && (
            <FolderEditPopover folder={folder} onClose={() => setPopover(false)} onDelete={onDelete} />
          )}
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
  const termsOf = (folderId: string): TermInfo[] => state.terminals.filter((t) => t.folderId === folderId)

  const addFolder = async (): Promise<void> => {
    const name = `Папка ${state.folders.length + 1}`
    const p = await window.api.createFolder(name)
    window.api.setActiveFolder(p.id)
  }

  return (
    <div className="topbar">
      <div className="tabs">
        {state.folders.map((p) => (
          <FolderTab
            key={p.id}
            folder={p}
            terms={termsOf(p.id)}
            active={p.id === state.activeFolderId && view === 'grid'}
            onActivate={() => {
              onSetView('grid')
              window.api.setActiveFolder(p.id)
            }}
            onRename={(name) => window.api.renameFolder(p.id, name)}
            onDelete={() => window.api.deleteFolder(p.id)}
          />
        ))}
        <button className="tab-add" onClick={addFolder} title="Новая папка">
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
