import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/** Закрытие по клику вне элемента и по Esc */
export function useDismiss(onClose: () => void, active = true): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!active) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, active])
  return ref
}

export interface MenuItem {
  label: string
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  submenu?: MenuItem[]
}

/** Выпадающее меню: кнопка-триггер + позиционируемый снизу список */
export function Menu({
  trigger,
  items,
  align = 'left'
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useDismiss(() => setOpen(false), open)

  return (
    <div className="menu-wrap" ref={ref}>
      {trigger(open, () => setOpen((v) => !v))}
      {open && (
        <div className={`menu-pop ${align === 'right' ? 'menu-right' : ''}`}>
          {items.map((it, i) => (
            <MenuRow key={i} item={it} onClose={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  )
}

function MenuRow({ item, onClose }: { item: MenuItem; onClose: () => void }): React.JSX.Element {
  const [subOpen, setSubOpen] = useState(false)
  if (item.submenu) {
    return (
      <div
        className="menu-item has-sub"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <span>{item.label}</span>
        <span className="sub-arrow">›</span>
        {subOpen && (
          <div className="menu-pop submenu">
            {item.submenu.map((s, i) => (
              <MenuRow key={i} item={s} onClose={onClose} />
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <button
      className={`menu-item ${item.danger ? 'danger' : ''}`}
      disabled={item.disabled}
      onClick={() => {
        item.onClick?.()
        onClose()
      }}
    >
      {item.label}
    </button>
  )
}

/** Модальное окно с затемнением, закрытие по фону/Esc */
export function Modal({
  onClose,
  children,
  width = '70%'
}: {
  onClose: () => void
  children: ReactNode
  width?: string
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
