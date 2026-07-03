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
            <MenuRow key={i} item={it} align={align} onClose={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  )
}

function MenuRow({
  item,
  align = 'left',
  onClose
}: {
  item: MenuItem
  align?: 'left' | 'right'
  onClose: () => void
}): React.JSX.Element {
  const [subOpen, setSubOpen] = useState(false)
  if (item.submenu) {
    return (
      <div
        className="menu-item has-sub"
        onMouseEnter={() => setSubOpen(true)}
        onMouseLeave={() => setSubOpen(false)}
      >
        <span>{item.label}</span>
        {/* у right-меню подменю открываем влево, иначе уходит за край экрана */}
        <span className="sub-arrow">{align === 'right' ? '‹' : '›'}</span>
        {subOpen && (
          <div className={`menu-pop submenu ${align === 'right' ? 'submenu-left' : ''}`}>
            {item.submenu.map((s, i) => (
              <MenuRow key={i} item={s} align={align} onClose={onClose} />
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

/** Простой ввод строки (замена window.prompt, который в Electron не работает) */
export function PromptModal({
  title,
  placeholder,
  initial = '',
  onSubmit,
  onClose
}: {
  title: string
  placeholder?: string
  initial?: string
  onSubmit: (value: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [val, setVal] = useState(initial)
  const submit = (): void => {
    const v = val.trim()
    if (v) onSubmit(v)
    onClose()
  }
  return (
    <Modal onClose={onClose} width="440px">
      <div className="modal-head">
        <h3>{title}</h3>
      </div>
      <div className="modal-body form">
        <input
          autoFocus
          value={val}
          placeholder={placeholder}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={submit}>
            ОК
          </button>
        </div>
      </div>
    </Modal>
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
