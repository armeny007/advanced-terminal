// Палитра — та же, что у десктопного приложения (Catppuccin Mocha)
export const C = {
  bg: '#11111b',
  surface: '#1e1e2e',
  surface2: '#181825',
  border: '#313244',
  text: '#cdd6f4',
  muted: '#6c7086',
  accent: '#89b4fa',
  danger: '#f38ba8',
  warn: '#fab387',
  ok: '#a6e3a1'
}

export const STATUS_COLOR: Record<string, string> = {
  none: '#6c7086',
  working: '#89b4fa',
  idle: '#a6e3a1',
  needs_input: '#f38ba8',
  permission: '#fab387'
}

export const STATUS_LABEL: Record<string, string> = {
  none: 'Claude не запущен',
  working: 'работает…',
  idle: 'готово',
  needs_input: 'ждёт ввода',
  permission: 'нужно разрешение'
}
