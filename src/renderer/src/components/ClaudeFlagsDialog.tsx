import { useState } from 'react'
import type { ClaudeLaunchOptions } from '../../../shared/types'
import { Modal } from '../lib/ui'

/** Собрать строку аргументов claude из опций */
export function buildClaudeArgs(o: ClaudeLaunchOptions): string {
  const parts: string[] = []
  if (o.chrome) parts.push('--chrome')
  if (o.autoMode) parts.push('--enable-auto-mode')
  if (o.skipPermissions) parts.push('--dangerously-skip-permissions')
  if (o.verbose) parts.push('--verbose')
  if (o.model) parts.push(`--model ${o.model}`)
  if (o.custom.trim()) parts.push(o.custom.trim())
  return parts.join(' ')
}

const FLAGS: { key: keyof ClaudeLaunchOptions; flag: string; label: string }[] = [
  { key: 'chrome', flag: '--chrome', label: 'Chrome (браузерная интеграция)' },
  { key: 'autoMode', flag: '--enable-auto-mode', label: 'Авто-режим' },
  { key: 'skipPermissions', flag: '--dangerously-skip-permissions', label: 'Без запросов разрешений' },
  { key: 'verbose', flag: '--verbose', label: 'Подробный вывод' }
]

const MODELS = [
  { value: '', label: 'По умолчанию' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' }
]

export function ClaudeFlagsDialog({
  initial,
  onLaunch,
  onClose
}: {
  initial: ClaudeLaunchOptions
  onLaunch: (opts: ClaudeLaunchOptions) => void
  onClose: () => void
}): React.JSX.Element {
  const [opts, setOpts] = useState<ClaudeLaunchOptions>(initial)
  const preview = 'claude --session-id … ' + buildClaudeArgs(opts)

  return (
    <Modal onClose={onClose} width="460px">
      <div className="modal-head">
        <h3>Новая сессия Claude</h3>
      </div>
      <div className="modal-body form">
        {FLAGS.map((f) => (
          <label key={f.key} className="flag-row">
            <input
              type="checkbox"
              checked={opts[f.key] as boolean}
              onChange={(e) => setOpts({ ...opts, [f.key]: e.target.checked })}
            />
            <span>{f.label}</span>
            <code className="flag-code">{f.flag}</code>
          </label>
        ))}

        <label className="flag-inline">
          <span>Модель</span>
          <select value={opts.model} onChange={(e) => setOpts({ ...opts, model: e.target.value })}>
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Дополнительные параметры
          <input
            value={opts.custom}
            placeholder="напр. --add-dir ../shared"
            onChange={(e) => setOpts({ ...opts, custom: e.target.value })}
          />
        </label>

        <code className="cmd-preview">{preview.trim()}</code>

        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={() => onLaunch(opts)}>
            Запустить
          </button>
        </div>
      </div>
    </Modal>
  )
}
