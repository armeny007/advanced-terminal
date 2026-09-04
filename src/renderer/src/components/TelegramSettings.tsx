import { useEffect, useState } from 'react'
import type { TelegramRuntimeState } from '../../../shared/types'
import { Modal } from '../lib/ui'

export function TelegramSettings({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [rt, setRt] = useState<TelegramRuntimeState | null>(null)
  const [token, setToken] = useState('')
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.api.getTelegramRuntime().then(setRt)
    return window.api.onTelegramRuntime(setRt)
  }, [])

  const saveToken = async (): Promise<void> => {
    if (!token.trim()) return
    setBusy(true)
    setRt(await window.api.setTelegramToken(token.trim()))
    setToken('')
    setBusy(false)
  }
  const clearToken = async (): Promise<void> => {
    setBusy(true)
    setRt(await window.api.setTelegramToken(null))
    setBusy(false)
  }
  const patch = async (p: Parameters<typeof window.api.patchTelegramSettings>[0]): Promise<void> => {
    setRt(await window.api.patchTelegramSettings(p))
  }
  const genCode = async (): Promise<void> => {
    setPairing(await window.api.generateTelegramPairingCode())
  }
  const unpair = (id: number): void => {
    if (!rt) return
    void patch({ allowedChatIds: rt.allowedChatIds.filter((x) => x !== id) })
  }

  const starting = rt?.starting ?? false
  const statusText = !rt
    ? '…'
    : starting
      ? 'подключение к Telegram…'
      : rt.error
        ? `ошибка: ${rt.error}`
        : rt.running
          ? 'бот запущен'
          : rt.enabled
            ? rt.hasToken
              ? 'ожидание…'
              : 'нет токена'
            : 'выключен'

  return (
    <Modal onClose={onClose} width="480px">
      <div className="modal-head">
        <h3>Telegram-бот</h3>
      </div>
      <div className="modal-body form">
        <p className="tg-hint">
          Управление сессиями Claude Code с телефона. Создайте бота у{' '}
          <b>@BotFather</b> (команда /newbot), вставьте токен ниже, включите бота и привяжите свой
          аккаунт кодом сопряжения.
        </p>

        <div className="tg-status">
          Статус: {starting && <span className="tg-spinner" aria-hidden="true" />}
          <b>{statusText}</b>
          {rt && <> · токен: {rt.hasToken ? 'задан ✓' : 'не задан'}</>}
        </div>

        <label>
          Токен бота
          <input
            type="password"
            value={token}
            placeholder={rt?.hasToken ? '•••••••• (задан)' : '123456:ABC-DEF…'}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <div className="form-actions" style={{ justifyContent: 'flex-start', gap: 8 }}>
          <button className="btn primary" disabled={busy || starting || !token.trim()} onClick={saveToken}>
            Сохранить токен
          </button>
          {rt?.hasToken && (
            <button className="btn" disabled={busy || starting} onClick={clearToken}>
              Удалить токен
            </button>
          )}
        </div>

        <label className="flag-row" style={{ marginTop: 4 }}>
          <input
            type="checkbox"
            checked={rt?.enabled ?? false}
            disabled={!rt || !rt.hasToken || starting || busy}
            onChange={(e) => void patch({ enabled: e.target.checked })}
          />
          <span>Включить бота{rt && !rt.hasToken ? ' (сначала сохраните токен)' : ''}</span>
        </label>
        <label className="flag-row">
          <input
            type="checkbox"
            checked={rt?.showOutputTail ?? true}
            disabled={!rt}
            onChange={(e) => void patch({ showOutputTail: e.target.checked })}
          />
          <span>Кнопка «Вывод» (хвост вывода терминала)</span>
        </label>

        <div className="tg-section">
          <div className="tg-section-title">Сопряжение аккаунта</div>
          <button className="btn" onClick={genCode}>
            Сгенерировать код
          </button>
          {pairing && (
            <div className="tg-pairing">
              Код: <code className="flag-code">{pairing.code}</code> — отправьте боту{' '}
              <code className="flag-code">/start {pairing.code}</code> (действует 5 минут).
            </div>
          )}
          {rt && rt.allowedChatIds.length > 0 && (
            <div className="tg-accounts">
              Привязанные аккаунты:
              {rt.allowedChatIds.map((id) => (
                <span key={id} className="tg-account">
                  {id}
                  <button className="tg-account-x" title="Отвязать" onClick={() => unpair(id)}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="tg-section">
          <div className="tg-section-title">Группа Telegram с темами (тема = вкладка)</div>
          {rt?.groupChatId != null ? (
            <div className="tg-pairing">
              Привязана группа Telegram <code className="flag-code">{rt.groupChatId}</code>
              <button
                className="btn small"
                style={{ marginLeft: 8 }}
                onClick={() => void patch({ groupChatId: null, folderTopics: {} })}
              >
                Отвязать
              </button>
            </div>
          ) : (
            <p className="tg-hint">
              Необязательно. Создайте в Telegram группу и включите в её настройках <b>«Темы»</b>{' '}
              (Topics). Добавьте бота администратором с правом «Управление темами» (Manage Topics) и
              отправьте в группе команду <code className="flag-code">/bindgroup</code>. Для каждой
              вкладки создастся отдельная тема Telegram, куда будут падать уведомления её сессий.
            </p>
          )}
        </div>

        <div className="form-actions">
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </Modal>
  )
}
