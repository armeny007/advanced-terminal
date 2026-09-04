// Подготовка вывода терминала к показу в Telegram: снятие ANSI и обрезка.

// Стандартный ansi-regex (через конструктор, чтобы не было литеральных управляющих символов).
const ANSI_RE = new RegExp(
  [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))'
  ].join('|'),
  'g'
)

// Прочие управляющие символы; диапазон не включает LF и TAB, поэтому они сохраняются.
const CTRL_RE = new RegExp('[\\u0000-\\u0008\\u000B-\\u001F\\u007F]', 'g')

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

/** Хвост вывода → безопасный текст для моноширинного блока Telegram */
export function formatOutputTail(raw: string, maxLen = 3500): string {
  let text = stripAnsi(raw).replace(/\r/g, '')
  text = text.replace(CTRL_RE, '')
  text = text.replace(/\n{3,}/g, '\n\n').trimEnd()
  if (text.length > maxLen) text = '…\n' + text.slice(text.length - maxLen)
  return text || '(пусто)'
}

/** Экранирование для HTML parse_mode Telegram */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
