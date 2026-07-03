import type { ClaudeStatus, TermInfo } from '../../../shared/types'

export const STATUS_COLOR: Record<ClaudeStatus, string> = {
  working: '#89b4fa',
  needs_input: '#f9e2af',
  permission: '#fab387',
  idle: '#a6e3a1',
  none: '#6c7086'
}

export const STATUS_LABEL: Record<ClaudeStatus, string> = {
  working: 'Работает',
  needs_input: 'Ждёт ввода',
  permission: 'Требует разрешения',
  idle: 'Свободен',
  none: 'Без Claude'
}

/** пульсирует ли точка статуса */
export function statusPulses(s: ClaudeStatus): boolean {
  return s === 'working' || s === 'needs_input' || s === 'permission'
}

export interface FolderBadge {
  color: string
  text: string
  pulse: boolean
}

/** Сводный бейдж папки по приоритету: permission > needs_input > working */
export function folderBadge(terms: TermInfo[]): FolderBadge | null {
  if (terms.some((t) => t.status === 'permission')) {
    return { color: STATUS_COLOR.permission, text: 'разрешение', pulse: true }
  }
  const waiting = terms.filter((t) => t.status === 'needs_input').length
  if (waiting > 0) {
    return { color: STATUS_COLOR.needs_input, text: `${waiting} ждёт`, pulse: true }
  }
  if (terms.some((t) => t.status === 'working')) {
    return { color: STATUS_COLOR.working, text: '', pulse: true }
  }
  return null
}

/** ~/... сокращение домашней директории */
export function shortenPath(p: string): string {
  const home = '/Users/'
  if (p.startsWith(home)) {
    const rest = p.slice(home.length).split('/').slice(1).join('/')
    return '~/' + rest
  }
  return p
}

export function basename(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}
